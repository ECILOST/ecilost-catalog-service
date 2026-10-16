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
import { CachingMediaStorage } from '../src/media-asset/storage/caching-media-storage.js';
import { FakeMediaAssetRepository, FakeMediaStorage } from './helpers/fake-media.js';
import { FakeItemRepository } from './helpers/fake-repositories.js';

const FUNCIONARIO = new Principal('11111111-1111-4111-8111-111111111111', 'STAFF');
const ESTUDIANTE = new Principal('22222222-2222-4222-8222-222222222222', 'STUDENT');
const GANADORA = new Principal('33333333-3333-4333-8333-333333333333', 'STUDENT');

let actor: Principal | null = FUNCIONARIO;

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!actor) throw new UnauthorizedException('Falta el token de acceso.');
    context.switchToHttp().getRequest<RequestWithPrincipal>().principal = actor;
    return true;
  }
}

/**
 * Lote misterioso (ADR-0002): el objeto que oculta la ruleta no se puede encontrar por la API
 * del catalogo, ni listando ni pidiendolo por su id. Solo lo ve el funcionario y, al cerrar la
 * ronda, quien lo gano.
 */
describe('Lote misterioso en el catalogo (e2e)', () => {
  let app: INestApplication;
  let items: FakeItemRepository;
  let hiddenId: string;
  let visibleId: string;

  beforeEach(async () => {
    actor = FUNCIONARIO;
    items = new FakeItemRepository();
    const moduleRef = await Test.createTestingModule({ imports: [ItemsModule], providers: [RolesGuard] })
      .overrideProvider(ITEM_REPOSITORY)
      .useValue(items)
      .overrideProvider(MEDIA_ASSET_REPOSITORY)
      .useValue(new FakeMediaAssetRepository(items))
      .overrideProvider(MEDIA_STORAGE)
      .useValue(new CachingMediaStorage(new FakeMediaStorage()))
      .overrideGuard(JwtAuthGuard)
      .useClass(StubAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    hiddenId = items.seed({ name: 'Tablet Samsung', status: 'IN_ROUND', roundId: 'r1', mystery: true }).id;
    visibleId = items.seed({ name: 'Sombrilla negra' }).id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('el estudiante no lo encuentra en el listado ni por su id', async () => {
    actor = ESTUDIANTE;
    const list = await request(app.getHttpServer()).get('/items').expect(200);
    expect(list.body.map((item: { id: string }) => item.id)).toEqual([visibleId]);
    expect(JSON.stringify(list.body)).not.toContain('Tablet');

    const byIds = await request(app.getHttpServer()).get('/items').query({ ids: hiddenId }).expect(200);
    expect(byIds.body).toEqual([]);

    await request(app.getHttpServer()).get(`/items/${hiddenId}`).expect(404);
  });

  it('el funcionario lo sigue viendo, con sus pistas', async () => {
    items.rows.set(hiddenId, { ...items.rows.get(hiddenId)!, clues: ['Encontrado en bloque G'] });
    const detail = await request(app.getHttpServer()).get(`/items/${hiddenId}`).expect(200);
    expect(detail.body).toMatchObject({ name: 'Tablet Samsung', clues: ['Encontrado en bloque G'] });
  });

  it('al cerrar la ronda se le revela a quien lo gano, y solo a esa persona', async () => {
    items.rows.set(hiddenId, { ...items.rows.get(hiddenId)!, status: 'SOLD', awardedTo: GANADORA.userId });

    actor = GANADORA;
    const revealed = await request(app.getHttpServer()).get(`/items/${hiddenId}`).expect(200);
    expect(revealed.body.name).toBe('Tablet Samsung');
    // Las pistas no viajan en la ficha del estudiante.
    expect(revealed.body).not.toHaveProperty('clues');

    actor = ESTUDIANTE;
    await request(app.getHttpServer()).get(`/items/${hiddenId}`).expect(404);
  });

  it('el funcionario registra pistas al dar de alta; vacias se descartan y hay tope', async () => {
    const created = await request(app.getHttpServer())
      .post('/items')
      .send({ name: 'Reloj', description: 'Correa de cuero', condition: 'GOOD', category: 'Accesorios', clues: [' Funciona ', '', 'Bloque B'] })
      .expect(201);
    expect(created.body.clues).toEqual(['Funciona', 'Bloque B']);

    await request(app.getHttpServer())
      .post('/items')
      .send({ name: 'Reloj', description: 'x', condition: 'GOOD', category: 'Accesorios', clues: ['1', '2', '3', '4', '5', '6'] })
      .expect(400);
  });
});
