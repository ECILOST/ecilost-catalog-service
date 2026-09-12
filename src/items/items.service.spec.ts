import { beforeEach, describe, expect, it } from 'vitest';
import { FakeItemRepository } from '../../test/helpers/fake-repositories.js';
import { InvalidStatusTransitionError, ItemNotFoundError } from './domain/item-errors.js';
import { ItemsService } from './items.service.js';
import { DEFAULT_PAGE_SIZE } from './dto/list-items-query.dto.js';
import {
  ItemVersionConflictError,
  type RegisterItemInput,
} from './ports/item.repository.js';

const FUNCIONARIO = '11111111-1111-4111-8111-111111111111';
const OTRO_FUNCIONARIO = '44444444-4444-4444-8444-444444444444';

function alta(overrides: Partial<RegisterItemInput> = {}): RegisterItemInput {
  return {
    name: 'Portatil Lenovo ThinkPad',
    description: 'Carcasa negra con una calcomania de la universidad.',
    condition: 'GOOD',
    category: 'Electronica',
    registeredBy: FUNCIONARIO,
    ...overrides,
  };
}

const TODO = { limit: DEFAULT_PAGE_SIZE, offset: 0 };

describe('ItemsService', () => {
  let repository: FakeItemRepository;
  let service: ItemsService;

  beforeEach(() => {
    repository = new FakeItemRepository();
    service = new ItemsService(repository);
  });

  describe('register (HU-03)', () => {
    it('almacena el objeto en estado Disponible y sin sala asociada', async () => {
      const item = await service.register(alta());

      expect(item.status).toBe('AVAILABLE');
      expect(item.roundId).toBeNull();
      expect(item.lotId).toBeNull();
    });

    it('le asigna identificador propio', async () => {
      const item = await service.register(alta());

      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('arranca en version cero, que es la que el cliente devolvera al editar', async () => {
      const item = await service.register(alta());

      expect(item.version).toBe(0);
    });

    it('guarda quien lo registro y lo toma como ultimo modificador', async () => {
      const item = await service.register(alta());

      expect(item.registeredBy).toBe(FUNCIONARIO);
      expect(item.lastModifiedBy).toBe(FUNCIONARIO);
    });

    it('conserva los datos declarados por el funcionario', async () => {
      const item = await service.register(
        alta({ name: 'Sombrilla azul', category: 'Accesorios', condition: 'FAIR' }),
      );

      expect(item.name).toBe('Sombrilla azul');
      expect(item.category).toBe('Accesorios');
      expect(item.condition).toBe('FAIR');
    });

    it('dos altas iguales producen objetos distintos', async () => {
      // No hay deduplicacion: dos paraguas negros identicos son dos objetos perdidos.
      const uno = await service.register(alta());
      const otro = await service.register(alta());

      expect(uno.id).not.toBe(otro.id);
      expect(repository.rows.size).toBe(2);
    });
  });

  describe('findAll (HU-03, criterio 3)', () => {
    it('el objeto recien registrado aparece en el catalogo', async () => {
      const creado = await service.register(alta());

      const catalogo = await service.findAll(TODO);

      expect(catalogo.map((i) => i.id)).toContain(creado.id);
    });

    it('devuelve vacio cuando no hay nada registrado', async () => {
      // Un catalogo sin objetos es una lista vacia, no un error.
      await expect(service.findAll(TODO)).resolves.toEqual([]);
    });

    it('filtra por estado', async () => {
      await service.register(alta());
      repository.seed({ status: 'SOLD' });

      const disponibles = await service.findAll({ ...TODO, status: 'AVAILABLE' });

      expect(disponibles).toHaveLength(1);
      expect(disponibles[0].status).toBe('AVAILABLE');
    });

    it('filtra por categoria', async () => {
      await service.register(alta({ category: 'Electronica' }));
      await service.register(alta({ category: 'Accesorios' }));

      const accesorios = await service.findAll({ ...TODO, category: 'Accesorios' });

      expect(accesorios).toHaveLength(1);
      expect(accesorios[0].category).toBe('Accesorios');
    });

    it('respeta el tope de pagina', async () => {
      await service.register(alta());
      await service.register(alta());
      await service.register(alta());

      await expect(service.findAll({ limit: 2, offset: 0 })).resolves.toHaveLength(2);
      await expect(service.findAll({ limit: 2, offset: 2 })).resolves.toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('devuelve el objeto cuando existe', async () => {
      const creado = await service.register(alta());

      await expect(service.findById(creado.id)).resolves.toMatchObject({ id: creado.id });
    });

    it('lanza un error de dominio cuando no existe', async () => {
      // El servicio no conoce HTTP: quien traduce esto a 404 es el controlador.
      await expect(service.findById('no-existe')).rejects.toBeInstanceOf(ItemNotFoundError);
    });
  });

  describe('update (HU-04)', () => {
    it('persiste el cambio con su autor y marca de ultima modificacion', async () => {
      const item = repository.seed();

      const actualizado = await service.update({
        id: item.id,
        expectedVersion: 0,
        patch: { description: 'Ahora con el cargador incluido.' },
        lastModifiedBy: OTRO_FUNCIONARIO,
      });

      expect(actualizado.description).toBe('Ahora con el cargador incluido.');
      expect(actualizado.lastModifiedBy).toBe(OTRO_FUNCIONARIO);
      expect(actualizado.lastModifiedAt.getTime()).toBeGreaterThanOrEqual(
        item.lastModifiedAt.getTime(),
      );
    });

    it('incrementa la version en cada escritura aceptada', async () => {
      const item = repository.seed();

      const primera = await service.update({
        id: item.id,
        expectedVersion: 0,
        patch: { name: 'Uno' },
        lastModifiedBy: FUNCIONARIO,
      });
      const segunda = await service.update({
        id: item.id,
        expectedVersion: primera.version,
        patch: { name: 'Dos' },
        lastModifiedBy: FUNCIONARIO,
      });

      expect(primera.version).toBe(1);
      expect(segunda.version).toBe(2);
    });

    it('no toca los campos ausentes', async () => {
      const item = repository.seed({ name: 'Sombrilla azul', category: 'Accesorios' });

      const actualizado = await service.update({
        id: item.id,
        expectedVersion: 0,
        patch: { name: 'Sombrilla azul marino' },
        lastModifiedBy: FUNCIONARIO,
      });

      expect(actualizado.name).toBe('Sombrilla azul marino');
      expect(actualizado.category).toBe('Accesorios');
      expect(actualizado.condition).toBe(item.condition);
    });

    it('rechaza una version ya superada', async () => {
      const item = repository.seed();
      await service.update({
        id: item.id,
        expectedVersion: 0,
        patch: { name: 'Uno' },
        lastModifiedBy: FUNCIONARIO,
      });

      await expect(
        service.update({
          id: item.id,
          expectedVersion: 0,
          patch: { name: 'Tarde' },
          lastModifiedBy: OTRO_FUNCIONARIO,
        }),
      ).rejects.toBeInstanceOf(ItemVersionConflictError);
    });

    it('distingue un objeto inexistente de una version vieja', async () => {
      // Para el adaptador las dos son cero filas afectadas; para el cliente no.
      await expect(
        service.update({
          id: '33333333-3333-4333-8333-333333333333',
          expectedVersion: 0,
          patch: { name: 'Fantasma' },
          lastModifiedBy: FUNCIONARIO,
        }),
      ).rejects.toBeInstanceOf(ItemNotFoundError);
    });

    it('dos funcionarios editando a la vez: una entra y la otra se rechaza', async () => {
      const item = repository.seed();

      const resultados = await Promise.allSettled([
        service.update({
          id: item.id,
          expectedVersion: 0,
          patch: { name: 'A' },
          lastModifiedBy: FUNCIONARIO,
        }),
        service.update({
          id: item.id,
          expectedVersion: 0,
          patch: { name: 'B' },
          lastModifiedBy: OTRO_FUNCIONARIO,
        }),
      ]);

      const aceptadas = resultados.filter((r) => r.status === 'fulfilled');
      const rechazadas = resultados.filter((r) => r.status === 'rejected');

      expect(aceptadas).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);
      expect((rechazadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ItemVersionConflictError,
      );

      // Ni se pierde ni se mezcla: el objeto quedo con uno de los dos nombres, entero.
      const final = await service.findById(item.id);
      expect(['A', 'B']).toContain(final.name);
      expect(final.version).toBe(1);
    });

    describe('cambio de estado', () => {
      it('permite retirar un objeto disponible', async () => {
        const item = repository.seed({ status: 'AVAILABLE' });

        const actualizado = await service.update({
          id: item.id,
          expectedVersion: 0,
          patch: { status: 'WITHDRAWN' },
          lastModifiedBy: FUNCIONARIO,
        });

        expect(actualizado.status).toBe('WITHDRAWN');
      });

      it('rechaza declarar vendido a mano', async () => {
        // Esa transicion la mueve la adjudicacion, no el formulario del catalogo.
        const item = repository.seed({ status: 'AVAILABLE' });

        await expect(
          service.update({
            id: item.id,
            expectedVersion: 0,
            patch: { status: 'SOLD' },
            lastModifiedBy: FUNCIONARIO,
          }),
        ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
      });

      it('rechaza sacar un objeto de una ronda a mano', async () => {
        const item = repository.seed({ status: 'IN_ROUND', roundId: 'ronda-1' });

        await expect(
          service.update({
            id: item.id,
            expectedVersion: 0,
            patch: { status: 'AVAILABLE' },
            lastModifiedBy: FUNCIONARIO,
          }),
        ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
      });

      it('no falla si el PATCH reenvia el estado actual junto con otros campos', async () => {
        const item = repository.seed({ status: 'IN_ROUND', roundId: 'ronda-1' });

        const actualizado = await service.update({
          id: item.id,
          expectedVersion: 0,
          patch: { status: 'IN_ROUND', description: 'Se le agrego el numero de serie.' },
          lastModifiedBy: FUNCIONARIO,
        });

        expect(actualizado.status).toBe('IN_ROUND');
      });
    });
  });
});
