import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Principal } from '../src/auth/domain/principal.js';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter.js';
import { JwtAuthGuard, type RequestWithPrincipal } from '../src/common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/common/guards/roles.guard.js';
import { ItemsModule } from '../src/items/items.module.js';
import { ITEM_REPOSITORY } from '../src/items/ports/item.repository.js';
import { MEDIA_ASSET_REPOSITORY } from '../src/media-asset/ports/media-asset.repository.js';
import { MEDIA_STORAGE } from '../src/media-asset/ports/media-storage.js';
import {
  almacenComoEnProduccion,
  FakeMediaAssetRepository,
} from './helpers/fake-media.js';
import { jpeg, png } from './helpers/media-fixtures.js';
import { FakeItemRepository } from './helpers/fake-repositories.js';

const FUNCIONARIO = new Principal('11111111-1111-4111-8111-111111111111', 'STAFF');
const ESTUDIANTE = new Principal('22222222-2222-4222-8222-222222222222', 'STUDENT');

const ALTA_VALIDA = {
  name: 'Portatil Lenovo ThinkPad',
  description: 'Carcasa negra con una calcomania de la universidad en la tapa.',
  condition: 'GOOD',
  category: 'Electronica',
};

/** Quien va firmando las peticiones. `null` simula una peticion sin sesion. */
let actor: Principal | null = FUNCIONARIO;

/**
 * Sustituye a JwtAuthGuard para no depender de un auth-service vivo. La verificacion real
 * del JWT ya la cubre token-verifier.spec.ts; aqui interesa lo que hay despues del guard.
 * RolesGuard es el de verdad, asi que la regla de rol si se ejerce.
 */
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!actor) throw new UnauthorizedException('Falta el token de acceso.');
    context.switchToHttp().getRequest<RequestWithPrincipal>().principal = actor;
    return true;
  }
}

describe('Items (e2e)', () => {
  let app: INestApplication;
  let repository: FakeItemRepository;

  beforeEach(async () => {
    actor = FUNCIONARIO;
    repository = new FakeItemRepository();

    const moduleRef = await Test.createTestingModule({
      imports: [ItemsModule],
      providers: [RolesGuard],
    })
      .overrideProvider(ITEM_REPOSITORY)
      .useValue(repository)
      // La ficha del objeto incluye su multimedia (HU-07), asi que ItemsModule arrastra al
      // modulo que la administra. Sus dos puertos se sustituyen por dobles para que esta
      // suite siga sin necesitar Postgres ni almacen de objetos. Lo que se ejercita aqui
      // son los objetos; la multimedia tiene su propia suite.
      .overrideProvider(MEDIA_ASSET_REPOSITORY)
      .useValue(new FakeMediaAssetRepository(repository))
      .overrideProvider(MEDIA_STORAGE)
      .useValue(almacenComoEnProduccion())
      .overrideGuard(JwtAuthGuard)
      .useClass(StubAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // Mismo cableado que main.ts: sin esto no se validarian los DTO ni saldria problem+json.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /items — criterio 1', () => {
    it('el funcionario registra el objeto y queda Disponible, sin sala', async () => {
      const { body, status } = await request(app.getHttpServer())
        .post('/items')
        .send(ALTA_VALIDA);

      expect(status).toBe(201);
      expect(body).toMatchObject({
        name: ALTA_VALIDA.name,
        category: ALTA_VALIDA.category,
        condition: 'GOOD',
        status: 'AVAILABLE',
        roundId: null,
        lotId: null,
        version: 0,
      });
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('registra al funcionario de la sesion como autor', async () => {
      const { body } = await request(app.getHttpServer()).post('/items').send(ALTA_VALIDA);

      expect(body.registeredBy).toBe(FUNCIONARIO.userId);
      expect(body.lastModifiedBy).toBe(FUNCIONARIO.userId);
    });
  });

  describe('POST /items — criterio 2: rechaza e indica cual campo falta', () => {
    it.each([['name'], ['description'], ['condition'], ['category']])(
      'sin %s responde 400 nombrando el campo',
      async (campo) => {
        const incompleto = { ...ALTA_VALIDA };
        delete (incompleto as Record<string, unknown>)[campo];

        const { body, status, headers } = await request(app.getHttpServer())
          .post('/items')
          .send(incompleto);

        expect(status).toBe(400);
        expect(headers['content-type']).toContain('application/problem+json');
        expect(JSON.stringify(body.errors)).toContain(campo);
        expect(repository.rows.size).toBe(0);
      },
    );

    it('rechaza una condicion que no esta en el catalogo de valores', async () => {
      const { body, status } = await request(app.getHttpServer())
        .post('/items')
        .send({ ...ALTA_VALIDA, condition: 'EXCELENTE' });

      expect(status).toBe(400);
      expect(JSON.stringify(body)).toContain('condition');
    });

    it('rechaza que el cliente escriba el estado', async () => {
      // El objeto nace AVAILABLE. Aceptar `status` dejaria registrar algo ya vendido.
      const { status } = await request(app.getHttpServer())
        .post('/items')
        .send({ ...ALTA_VALIDA, status: 'SOLD' });

      expect(status).toBe(400);
    });

    it('rechaza campos desconocidos en vez de ignorarlos', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/items')
        .send({ ...ALTA_VALIDA, precioSecreto: 1 });

      expect(status).toBe(400);
    });
  });

  describe('POST /items — rol y sesion', () => {
    it('el estudiante recibe 403 y no se registra nada', async () => {
      actor = ESTUDIANTE;

      const { body, status } = await request(app.getHttpServer())
        .post('/items')
        .send(ALTA_VALIDA);

      expect(status).toBe(403);
      expect(body.type).toContain('rol-insuficiente');
      expect(repository.rows.size).toBe(0);
    });

    it('sin sesion responde 401', async () => {
      actor = null;

      const { status } = await request(app.getHttpServer()).post('/items').send(ALTA_VALIDA);

      expect(status).toBe(401);
    });
  });

  describe('GET /items — criterio 3', () => {
    it('el objeto recien registrado aparece en el catalogo', async () => {
      const creado = await request(app.getHttpServer()).post('/items').send(ALTA_VALIDA);

      const { body, status } = await request(app.getHttpServer()).get('/items');

      expect(status).toBe(200);
      expect(body.map((i: { id: string }) => i.id)).toContain(creado.body.id);
    });

    it('cada fila trae la portada firmada, y nulo el objeto que no tiene fotografias', async () => {
      const conFoto = await request(app.getHttpServer()).post('/items').send(ALTA_VALIDA);
      const sinFoto = await request(app.getHttpServer())
        .post('/items')
        .send({ ...ALTA_VALIDA, name: 'Termo sin fotografias' });

      await request(app.getHttpServer())
        .post(`/items/${conFoto.body.id}/media`)
        .attach('file', png(), 'frente.png')
        .expect(201);

      const { body } = await request(app.getHttpServer()).get('/items');
      const fila = (id: string) => body.find((i: { id: string }) => i.id === id);

      // El listado sigue sin traer la galeria: una sola imagen, para reconocer el objeto.
      expect(fila(conFoto.body.id).coverUrl).toEqual(expect.stringContaining('http'));
      expect(fila(conFoto.body.id).photos).toBeUndefined();
      expect(fila(sinFoto.body.id).coverUrl).toBeNull();
    });

    it('la portada es la primera que queda, no la de posicion cero', async () => {
      const creado = await request(app.getHttpServer()).post('/items').send(ALTA_VALIDA);
      const primera = await request(app.getHttpServer())
        .post(`/items/${creado.body.id}/media`)
        .attach('file', png(), 'una.png');
      await request(app.getHttpServer())
        .post(`/items/${creado.body.id}/media`)
        .attach('file', jpeg(), 'dos.jpg');

      // Se retira la de posicion cero. Las demas NO se renumeran, asi que al objeto le
      // quedan fotografias pero ninguna en esa posicion.
      await request(app.getHttpServer())
        .delete(`/items/${creado.body.id}/media/${primera.body.id}`)
        .expect(204);

      const { body } = await request(app.getHttpServer()).get('/items');
      const fila = body.find((i: { id: string }) => i.id === creado.body.id);

      expect(fila.coverUrl).toEqual(expect.stringContaining('http'));
    });

    it('el estudiante tambien puede consultar el catalogo', async () => {
      // Cerrarlo a funcionarios dejaria la HU-08 bloqueada de nacimiento.
      repository.seed();
      actor = ESTUDIANTE;

      const { status, body } = await request(app.getHttpServer()).get('/items');

      expect(status).toBe(200);
      expect(body).toHaveLength(1);
    });

    it('filtra por estado', async () => {
      repository.seed({ status: 'AVAILABLE' });
      repository.seed({ status: 'SOLD' });

      const { body } = await request(app.getHttpServer()).get('/items?status=AVAILABLE');

      expect(body).toHaveLength(1);
      expect(body[0].status).toBe('AVAILABLE');
    });

    it('rechaza un tope de pagina fuera de rango', async () => {
      const { status } = await request(app.getHttpServer()).get('/items?limit=5000');

      expect(status).toBe(400);
    });

    it('devuelve una lista vacia cuando no hay nada', async () => {
      const { body, status } = await request(app.getHttpServer()).get('/items');

      expect(status).toBe(200);
      expect(body).toEqual([]);
    });
  });

  describe('GET /items/:id', () => {
    it('devuelve la ficha con su version', async () => {
      const sembrado = repository.seed();

      const { body, status } = await request(app.getHttpServer()).get(`/items/${sembrado.id}`);

      expect(status).toBe(200);
      expect(body).toMatchObject({ id: sembrado.id, version: 0 });
    });

    it('responde 404 en problem+json cuando no existe', async () => {
      const { body, status, headers } = await request(app.getHttpServer()).get(
        '/items/33333333-3333-4333-8333-333333333333',
      );

      expect(status).toBe(404);
      expect(headers['content-type']).toContain('application/problem+json');
      expect(body).toMatchObject({ status: 404, type: expect.stringContaining('/problems/') });
    });

    it('responde 400 si el identificador no tiene forma de UUID', async () => {
      const { status } = await request(app.getHttpServer()).get('/items/no-es-uuid');

      expect(status).toBe(400);
    });
  });

  describe('PATCH /items/:id — HU-04', () => {
    it('aplica el cambio, incrementa la version y registra al autor', async () => {
      const item = repository.seed();

      const { body, status } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, description: 'Ahora con el cargador incluido.' });

      expect(status).toBe(200);
      expect(body).toMatchObject({
        description: 'Ahora con el cargador incluido.',
        version: 1,
        lastModifiedBy: FUNCIONARIO.userId,
      });
    });

    it('deja intactos los campos que no vienen en la peticion', async () => {
      const item = repository.seed({ name: 'Sombrilla azul', category: 'Accesorios' });

      const { body } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, name: 'Sombrilla azul marino' });

      expect(body.name).toBe('Sombrilla azul marino');
      expect(body.category).toBe('Accesorios');
    });

    it('exige la version: sin ella responde 400', async () => {
      const item = repository.seed();

      const { body, status } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ name: 'Sin version' });

      expect(status).toBe(400);
      expect(JSON.stringify(body)).toContain('version');
    });

    it('responde 409 cuando la version ya quedo vieja', async () => {
      const item = repository.seed();
      await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, name: 'Primero' });

      const { body, status, headers } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, name: 'Tarde' });

      expect(status).toBe(409);
      expect(headers['content-type']).toContain('application/problem+json');
      expect(body.type).toContain('conflicto-de-version');
    });

    it('dos peticiones simultaneas con la misma version: una 200 y una 409', async () => {
      // Es el criterio central de la HU-04. Lo que se ejerce aqui es el contrato; la
      // carrera real contra Postgres necesita la base viva y va en la prueba de
      // integracion.
      const item = repository.seed();

      const respuestas = await Promise.all([
        request(app.getHttpServer()).patch(`/items/${item.id}`).send({ version: 0, name: 'A' }),
        request(app.getHttpServer()).patch(`/items/${item.id}`).send({ version: 0, name: 'B' }),
      ]);

      const codigos = respuestas.map((r) => r.status).sort();
      expect(codigos).toEqual([200, 409]);

      // Ni se pierde ni se mezcla: quedo uno de los dos nombres, en version 1.
      const final = repository.rows.get(item.id);
      expect(['A', 'B']).toContain(final?.name);
      expect(final?.version).toBe(1);
    });

    it('responde 404 cuando el objeto no existe, no 409', async () => {
      const { body, status } = await request(app.getHttpServer())
        .patch('/items/33333333-3333-4333-8333-333333333333')
        .send({ version: 0, name: 'Fantasma' });

      expect(status).toBe(404);
      expect(body.status).toBe(404);
    });

    it('permite retirar un objeto disponible', async () => {
      const item = repository.seed({ status: 'AVAILABLE' });

      const { body, status } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, status: 'WITHDRAWN' });

      expect(status).toBe(200);
      expect(body.status).toBe('WITHDRAWN');
    });

    it('rechaza declarar vendido a mano, con un type distinto al de version', async () => {
      const item = repository.seed({ status: 'AVAILABLE' });

      const { body, status } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, status: 'SOLD' });

      expect(status).toBe(409);
      expect(body.type).toContain('transicion-invalida');
    });

    it('el estudiante recibe 403 y el objeto no cambia', async () => {
      const item = repository.seed({ name: 'Intacto' });
      actor = ESTUDIANTE;

      const { status } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, name: 'Modificado' });

      expect(status).toBe(403);
      expect(repository.rows.get(item.id)?.name).toBe('Intacto');
    });

    it('rechaza campos desconocidos en vez de ignorarlos', async () => {
      const item = repository.seed();

      const { status } = await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, registeredBy: 'otra-persona' });

      expect(status).toBe(400);
    });
  });

  describe('DELETE /items/:id — HU-04', () => {
    it('borra un objeto libre y responde 204 sin cuerpo', async () => {
      const item = repository.seed();

      const { status, text } = await request(app.getHttpServer()).delete(
        `/items/${item.id}?version=0`,
      );

      expect(status).toBe(204);
      expect(text).toBe('');
      expect(repository.rows.has(item.id)).toBe(false);
    });

    it('el objeto borrado ya no aparece en el catalogo', async () => {
      const item = repository.seed();
      await request(app.getHttpServer()).delete(`/items/${item.id}?version=0`);

      const { body } = await request(app.getHttpServer()).get('/items');

      expect(body).toEqual([]);
    });

    it('un objeto en ronda responde 409 e indica cual la bloquea', async () => {
      const item = repository.seed({ status: 'IN_ROUND', roundId: 'ronda-42' });

      const { body, status, headers } = await request(app.getHttpServer()).delete(
        `/items/${item.id}?version=0`,
      );

      expect(status).toBe(409);
      expect(headers['content-type']).toContain('application/problem+json');
      expect(body.type).toContain('objeto-comprometido');
      expect(body.detail).toContain('ronda-42');
      expect(repository.rows.has(item.id)).toBe(true);
    });

    it('un objeto en lote tambien responde 409', async () => {
      const item = repository.seed({ status: 'IN_LOT', lotId: 'lote-7' });

      const { body, status } = await request(app.getHttpServer()).delete(
        `/items/${item.id}?version=0`,
      );

      expect(status).toBe(409);
      expect(body.detail).toContain('lote-7');
    });

    it('un objeto vendido responde 409', async () => {
      const item = repository.seed({ status: 'SOLD' });

      const { status } = await request(app.getHttpServer()).delete(
        `/items/${item.id}?version=0`,
      );

      expect(status).toBe(409);
    });

    it('una version vieja responde 409 de conflicto, no de compromiso', async () => {
      const item = repository.seed();
      await request(app.getHttpServer())
        .patch(`/items/${item.id}`)
        .send({ version: 0, name: 'Editado' });

      const { body, status } = await request(app.getHttpServer()).delete(
        `/items/${item.id}?version=0`,
      );

      expect(status).toBe(409);
      expect(body.type).toContain('conflicto-de-version');
      expect(repository.rows.has(item.id)).toBe(true);
    });

    it('sin version en la consulta responde 400', async () => {
      const item = repository.seed();

      const { body, status } = await request(app.getHttpServer()).delete(`/items/${item.id}`);

      expect(status).toBe(400);
      expect(JSON.stringify(body)).toContain('version');
    });

    it('un objeto inexistente responde 404', async () => {
      const { status } = await request(app.getHttpServer()).delete(
        '/items/33333333-3333-4333-8333-333333333333?version=0',
      );

      expect(status).toBe(404);
    });

    it('el estudiante recibe 403 y el objeto sigue ahi', async () => {
      const item = repository.seed();
      actor = ESTUDIANTE;

      const { status } = await request(app.getHttpServer()).delete(
        `/items/${item.id}?version=0`,
      );

      expect(status).toBe(403);
      expect(repository.rows.has(item.id)).toBe(true);
    });
  });
});
