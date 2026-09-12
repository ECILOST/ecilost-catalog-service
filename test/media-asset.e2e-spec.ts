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
import {
  JwtAuthGuard,
  type RequestWithPrincipal,
} from '../src/common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/common/guards/roles.guard.js';
import { ItemsModule } from '../src/items/items.module.js';
import { ITEM_REPOSITORY } from '../src/items/ports/item.repository.js';
import { MAX_PHOTOS_PER_ITEM } from '../src/media-asset/domain/media-policy.js';
import { MEDIA_ASSET_REPOSITORY } from '../src/media-asset/ports/media-asset.repository.js';
import { MEDIA_STORAGE } from '../src/media-asset/ports/media-storage.js';
import { CachingMediaStorage } from '../src/media-asset/storage/caching-media-storage.js';
import {
  FakeMediaAssetRepository,
  FakeMediaStorage,
} from './helpers/fake-media.js';
import { FakeItemRepository } from './helpers/fake-repositories.js';
import { executable, jpeg, mp4, pdf, png } from './helpers/media-fixtures.js';

const FUNCIONARIO = new Principal(
  '11111111-1111-4111-8111-111111111111',
  'STAFF',
);
const ESTUDIANTE = new Principal(
  '22222222-2222-4222-8222-222222222222',
  'STUDENT',
);

/** Quien va firmando las peticiones. `null` simula una peticion sin sesion. */
let actor: Principal | null = FUNCIONARIO;

/**
 * Sustituye a JwtAuthGuard para no depender de un auth-service vivo, igual que en la suite
 * de objetos. RolesGuard es el de verdad, asi que la regla de rol si se ejerce.
 */
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!actor) throw new UnauthorizedException('Falta el token de acceso.');
    context.switchToHttp().getRequest<RequestWithPrincipal>().principal = actor;
    return true;
  }
}

describe('Multimedia del objeto (e2e)', () => {
  let app: INestApplication;
  let items: FakeItemRepository;
  let assets: FakeMediaAssetRepository;
  let storage: FakeMediaStorage;
  let itemId: string;

  beforeEach(async () => {
    actor = FUNCIONARIO;
    items = new FakeItemRepository();
    assets = new FakeMediaAssetRepository(items);
    storage = new FakeMediaStorage();

    const moduleRef = await Test.createTestingModule({
      // ItemsModule arrastra a MediaAssetModule, que es donde vive el controlador de
      // multimedia. Asi la ficha del objeto entra en la prueba sin cablear nada aparte.
      imports: [ItemsModule],
      providers: [RolesGuard],
    })
      .overrideProvider(ITEM_REPOSITORY)
      .useValue(items)
      .overrideProvider(MEDIA_ASSET_REPOSITORY)
      .useValue(assets)
      .overrideProvider(MEDIA_STORAGE)
      // Misma composicion que arma el modulo en produccion: el almacen detras de la cache
      // de enlaces. Las aserciones sobre archivos siguen mirando el doble del fondo.
      .useValue(new CachingMediaStorage(storage))
      .overrideGuard(JwtAuthGuard)
      .useClass(StubAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // Mismo cableado que main.ts: sin esto no saldria problem+json.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    itemId = items.seed().id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  const subir = (content: Buffer, filename: string, contentType: string) =>
    request(server())
      .post(`/items/${itemId}/media`)
      .attach('file', content, { filename, contentType });

  const subirFoto = () => subir(jpeg(), 'objeto.jpg', 'image/jpeg');
  const subirVideo = () => subir(mp4(), 'objeto.mp4', 'video/mp4');
  const ficha = () => request(server()).get(`/items/${itemId}`);

  describe('POST /items/:itemId/media — criterio 1', () => {
    it('el funcionario sube una fotografia y queda asociada al objeto', async () => {
      const { body, status } = await subirFoto();

      expect(status).toBe(201);
      expect(body).toMatchObject({
        kind: 'PHOTO',
        contentType: 'image/jpeg',
        position: 0,
      });
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.url).toContain('http');
    });

    it('la ficha del objeto referencia las fotografias y el video', async () => {
      await subirFoto();
      await subir(png(), 'otra.png', 'image/png');
      await subirVideo();

      const { body, status } = await ficha();

      expect(status).toBe(200);
      expect(body.photos).toHaveLength(2);
      expect(body.video).not.toBeNull();
      expect(body.video.kind).toBe('VIDEO');
      // Y sigue trayendo lo suyo, que es lo que la HU-03 ya entregaba.
      expect(body.name).toBe('Portatil Lenovo ThinkPad');
      expect(body.version).toBe(0);
    });

    it('un objeto sin multimedia trae la ficha con los campos vacios, no ausentes', async () => {
      const { body } = await ficha();

      expect(body.photos).toEqual([]);
      expect(body.video).toBeNull();
    });

    it('las fotografias llegan ordenadas', async () => {
      await subirFoto();
      await subir(png(), 'segunda.png', 'image/png');

      const { body } = await ficha();

      expect(body.photos.map((p: { position: number }) => p.position)).toEqual([
        0, 1,
      ]);
    });

    it('sin archivo responde 400 diciendo como enviarlo', async () => {
      const { body, status } = await request(server()).post(
        `/items/${itemId}/media`,
      );

      expect(status).toBe(400);
      expect(body.detail).toContain('file');
    });

    it('sobre un objeto que no existe responde 404', async () => {
      const inexistente = '99999999-9999-4999-8999-999999999999';

      const { status } = await request(server())
        .post(`/items/${inexistente}/media`)
        .attach('file', jpeg(), {
          filename: 'objeto.jpg',
          contentType: 'image/jpeg',
        });

      expect(status).toBe(404);
    });
  });

  describe('POST /items/:itemId/media — criterio 2: tipo no soportado', () => {
    it('rechaza un PDF con 415 y enumera los formatos admitidos', async () => {
      const { body, status, headers } = await subir(
        pdf(),
        'manual.pdf',
        'application/pdf',
      );

      expect(status).toBe(415);
      expect(headers['content-type']).toContain('application/problem+json');
      expect(body.type).toBe('/problems/formato-no-soportado');
      expect(body.detail).toContain('JPEG');
      expect(body.detail).toContain('MP4');
    });

    it('rechaza un ejecutable disfrazado de fotografia', async () => {
      // Nombre y Content-Type de imagen, bytes de ejecutable. Los dos primeros los escribe
      // el cliente; lo que decide es la cabecera del archivo.
      const { status } = await subir(executable(), 'foto.jpg', 'image/jpeg');

      expect(status).toBe(415);
    });

    it('no altera la ficha: lo que ya estaba sigue igual', async () => {
      const { body: previa } = await subirFoto();

      await subir(pdf(), 'manual.pdf', 'application/pdf');

      const { body } = await ficha();
      expect(body.photos).toHaveLength(1);
      expect(body.photos[0].id).toBe(previa.id);
      expect(storage.objects.size).toBe(1);
    });

    it('rechaza el segundo video con 409 y conserva el primero', async () => {
      const { body: primero } = await subirVideo();

      const { body, status } = await subirVideo();

      expect(status).toBe(409);
      expect(body.type).toBe('/problems/video-ya-existe');

      const { body: actual } = await ficha();
      expect(actual.video.id).toBe(primero.id);
    });

    it('rechaza la fotografia que pasa del tope con 409', async () => {
      for (let i = 0; i < MAX_PHOTOS_PER_ITEM; i += 1) await subirFoto();

      const { body, status } = await subirFoto();

      expect(status).toBe(409);
      expect(body.type).toBe('/problems/limite-de-fotografias');
    });
  });

  describe('DELETE /items/:itemId/media/:mediaId — criterio 3', () => {
    it('la fotografia borrada desaparece de la ficha', async () => {
      const { body: foto } = await subirFoto();

      const { status } = await request(server()).delete(
        `/items/${itemId}/media/${foto.id}`,
      );

      expect(status).toBe(204);
      const { body } = await ficha();
      expect(body.photos).toHaveLength(0);
    });

    it('el resto del contenido permanece intacto', async () => {
      const { body: borrada } = await subirFoto();
      const { body: conservada } = await subir(png(), 'otra.png', 'image/png');
      const { body: video } = await subirVideo();

      await request(server())
        .delete(`/items/${itemId}/media/${borrada.id}`)
        .expect(204);

      const { body } = await ficha();
      expect(body.photos.map((p: { id: string }) => p.id)).toEqual([
        conservada.id,
      ]);
      expect(body.video.id).toBe(video.id);
    });

    it('no borra multimedia que pertenece a otro objeto', async () => {
      const ajeno = items.seed();
      const { body: suya } = await request(server())
        .post(`/items/${ajeno.id}/media`)
        .attach('file', jpeg(), {
          filename: 'objeto.jpg',
          contentType: 'image/jpeg',
        });

      const { status } = await request(server()).delete(
        `/items/${itemId}/media/${suya.id}`,
      );

      expect(status).toBe(404);
      const { body } = await request(server()).get(`/items/${ajeno.id}`);
      expect(body.photos).toHaveLength(1);
    });

    it('una pieza que no existe responde 404', async () => {
      const { status } = await request(server()).delete(
        `/items/${itemId}/media/99999999-9999-4999-8999-999999999999`,
      );

      expect(status).toBe(404);
    });
  });

  describe('Autorizacion', () => {
    it('el estudiante no puede subir multimedia', async () => {
      actor = ESTUDIANTE;

      const { body, status } = await subirFoto();

      expect(status).toBe(403);
      expect(body.type).toBe('/problems/rol-insuficiente');
    });

    it('el estudiante no puede borrar multimedia', async () => {
      const { body: foto } = await subirFoto();
      actor = ESTUDIANTE;

      const { status } = await request(server()).delete(
        `/items/${itemId}/media/${foto.id}`,
      );

      expect(status).toBe(403);
    });

    it('el estudiante si consulta la ficha con su multimedia', async () => {
      await subirFoto();
      await subirVideo();
      actor = ESTUDIANTE;

      const { body, status } = await ficha();

      expect(status).toBe(200);
      expect(body.photos).toHaveLength(1);
      expect(body.video).not.toBeNull();
    });

    it('sin sesion no se sube nada', async () => {
      actor = null;

      const { status } = await subirFoto();

      expect(status).toBe(401);
    });
  });

  describe('Lecturas concurrentes de la misma ficha', () => {
    it('varios estudiantes la abren a la vez y reciben el mismo contenido', async () => {
      await subirFoto();
      await subir(png(), 'otra.png', 'image/png');
      await subirVideo();
      actor = ESTUDIANTE;

      const respuestas = await Promise.all(
        Array.from({ length: 25 }, () => ficha()),
      );

      const referencia = JSON.stringify(respuestas[0].body);
      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(200);
        expect(JSON.stringify(respuesta.body)).toBe(referencia);
      }
    });
  });
});
