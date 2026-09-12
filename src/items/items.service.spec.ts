import { beforeEach, describe, expect, it } from 'vitest';
import { FakeItemRepository } from '../../test/helpers/fake-repositories.js';
import { ItemNotFoundError } from './domain/item-errors.js';
import { ItemsService } from './items.service.js';
import { DEFAULT_PAGE_SIZE } from './dto/list-items-query.dto.js';
import type { RegisterItemInput } from './ports/item.repository.js';

const FUNCIONARIO = '11111111-1111-4111-8111-111111111111';

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
});
