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
import { jpeg, mp4, png } from './helpers/media-fixtures.js';

const FUNCIONARIO = new Principal('11111111-1111-4111-8111-111111111111', 'STAFF');
const ESTUDIANTE = new Principal('22222222-2222-4222-8222-222222222222', 'STUDENT');
const OTRO_ESTUDIANTE = new Principal('33333333-3333-4333-8333-333333333333', 'STUDENT');

/** Campos que solo le sirven a quien administra el catalogo. */
const CAMPOS_DE_FUNCIONARIO = [
  'version',
  'registeredBy',
  'lastModifiedBy',
  'lastModifiedAt',
] as const;

let actor: Principal | null = FUNCIONARIO;

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!actor) throw new UnauthorizedException('Falta el token de acceso.');
    context.switchToHttp().getRequest<RequestWithPrincipal>().principal = actor;
    return true;
  }
}

describe('Inspeccion de la ficha del objeto (e2e) — HU-08', () => {
  let app: INestApplication;
  let items: FakeItemRepository;
  let almacen: FakeMediaStorage;
  let itemId: string;

  beforeEach(async () => {
    actor = FUNCIONARIO;
    items = new FakeItemRepository();
    almacen = new FakeMediaStorage();

    const moduleRef = await Test.createTestingModule({
      imports: [ItemsModule],
      providers: [RolesGuard],
    })
      .overrideProvider(ITEM_REPOSITORY)
      .useValue(items)
      .overrideProvider(MEDIA_ASSET_REPOSITORY)
      .useValue(new FakeMediaAssetRepository(items))
      .overrideProvider(MEDIA_STORAGE)
      // La misma composicion que corre en produccion: el almacen detras de la cache.
      .useValue(new CachingMediaStorage(almacen))
      .overrideGuard(JwtAuthGuard)
      .useClass(StubAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    itemId = items.seed({
      name: 'Portatil Lenovo ThinkPad',
      description: 'Carcasa negra con una calcomania de la universidad en la tapa.',
      condition: 'FAIR',
      category: 'Electronica',
    }).id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  const adjuntar = (contenido: Buffer, nombre: string, tipo: string) => {
    const previo = actor;
    actor = FUNCIONARIO; // subir es operacion de funcionario
    return request(server())
      .post(`/items/${itemId}/media`)
      .attach('file', contenido, { filename: nombre, contentType: tipo })
      .then((r) => {
        actor = previo;
        return r;
      });
  };

  const abrirFicha = () => request(server()).get(`/items/${itemId}`);

  describe('Criterio 1: el estudiante abre el objeto y ve descripcion, fotos y video', () => {
    beforeEach(async () => {
      await adjuntar(jpeg(), 'frente.jpg', 'image/jpeg');
      await adjuntar(png(), 'dorso.png', 'image/png');
      await adjuntar(mp4(), 'estado.mp4', 'video/mp4');
      actor = ESTUDIANTE;
    });

    it('la ficha trae la descripcion detallada y la condicion del objeto', async () => {
      const { body, status } = await abrirFicha();

      expect(status).toBe(200);
      expect(body.description).toContain('calcomania de la universidad');
      expect(body.condition).toBe('FAIR');
      expect(body.category).toBe('Electronica');
    });

    it('trae las fotografias en orden, cada una con su enlace', async () => {
      const { body } = await abrirFicha();

      expect(body.photos).toHaveLength(2);
      expect(body.photos.map((p: { position: number }) => p.position)).toEqual([0, 1]);
      for (const foto of body.photos) expect(foto.url).toMatch(/^https?:\/\//);
    });

    it('trae el video disponible con su enlace', async () => {
      const { body } = await abrirFicha();

      expect(body.video).not.toBeNull();
      expect(body.video.kind).toBe('VIDEO');
      expect(body.video.contentType).toBe('video/mp4');
      expect(body.video.url).toMatch(/^https?:\/\//);
    });

    it('todo llega en una sola peticion, sin recurso aparte para la multimedia', async () => {
      const { body } = await abrirFicha();

      // Si esto deja de cumplirse, el frontend tendria que encadenar dos llamadas antes de
      // poder pintar la ficha.
      expect(Object.keys(body)).toEqual(
        expect.arrayContaining(['description', 'photos', 'video']),
      );
    });

    it('no existe si el objeto no existe', async () => {
      const { status } = await request(server()).get(
        '/items/99999999-9999-4999-8999-999999999999',
      );

      expect(status).toBe(404);
    });

    it('sin sesion no se abre la ficha', async () => {
      actor = null;

      const { status } = await abrirFicha();

      expect(status).toBe(401);
    });
  });

  describe('Criterio 2: varios estudiantes consultan la misma ficha a la vez', () => {
    beforeEach(async () => {
      await adjuntar(jpeg(), 'frente.jpg', 'image/jpeg');
      await adjuntar(png(), 'dorso.png', 'image/png');
      await adjuntar(mp4(), 'estado.mp4', 'video/mp4');
      actor = ESTUDIANTE;
    });

    it('treinta lecturas simultaneas responden todas 200 con el mismo contenido', async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 30 }, () => abrirFicha()),
      );

      const referencia = JSON.stringify(respuestas[0].body);
      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(200);
        expect(JSON.stringify(respuesta.body)).toBe(referencia);
      }
    });

    it('el enlace de cada pieza es identico entre lectores', async () => {
      // Es lo que el criterio pide de verdad: no basta con que describan el mismo objeto,
      // tienen que recibir el mismo contenido. Sin la cache de enlaces cada lector se
      // llevaria una URL distinta para el mismo archivo.
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, () => abrirFicha()),
      );

      const videos = new Set(respuestas.map((r) => r.body.video.url));
      const primeras = new Set(respuestas.map((r) => r.body.photos[0].url));

      expect(videos.size).toBe(1);
      expect(primeras.size).toBe(1);
    });

    it('dos estudiantes distintos reciben exactamente la misma ficha', async () => {
      actor = ESTUDIANTE;
      const { body: unaVista } = await abrirFicha();

      actor = OTRO_ESTUDIANTE;
      const { body: otraVista } = await abrirFicha();

      expect(otraVista).toEqual(unaVista);
    });

    it('abrir la ficha dos veces no obliga a firmar de nuevo cada archivo', async () => {
      // Lo que hace que el navegador pueda reutilizar el video que ya bajo, en vez de
      // descargarlo entero otra vez porque la URL cambio.
      const firmasTrasLaPrimera = almacen.firmas;

      await abrirFicha();
      await abrirFicha();

      expect(almacen.firmas).toBe(firmasTrasLaPrimera);
    });

    it('el almacen por si solo firmaria distinto cada vez', async () => {
      // Comprobacion de que el doble reproduce a S3. Sin esto, las dos pruebas de arriba
      // pasarian aunque la cache no existiera.
      const clave = 'items/x/y.jpg';

      expect(await almacen.signedReadUrl(clave, 900)).not.toBe(
        await almacen.signedReadUrl(clave, 900),
      );
    });
  });

  describe('Criterio 3: objeto sin video', () => {
    it('muestra las fotografias y la descripcion, con video en null', async () => {
      await adjuntar(jpeg(), 'frente.jpg', 'image/jpeg');
      actor = ESTUDIANTE;

      const { body, status } = await abrirFicha();

      expect(status).toBe(200);
      expect(body.video).toBeNull();
      expect(body.photos).toHaveLength(1);
      expect(body.description).toBeTruthy();
    });

    it('el campo video esta presente aunque sea nulo, nunca ausente', async () => {
      actor = ESTUDIANTE;

      const { body } = await abrirFicha();

      // Un campo ausente y uno nulo se ven igual en JavaScript pero no en un cliente
      // tipado: el ausente obliga a defenderse en cada punto donde se lea la ficha.
      expect(Object.hasOwn(body, 'video')).toBe(true);
      expect(body.video).toBeNull();
    });

    it('un objeto sin ninguna multimedia abre sin error, con la galeria vacia', async () => {
      actor = ESTUDIANTE;

      const { body, status } = await abrirFicha();

      expect(status).toBe(200);
      expect(body.photos).toEqual([]);
      expect(body.video).toBeNull();
      expect(body.name).toBe('Portatil Lenovo ThinkPad');
    });

    it('solo video, sin fotografias, tambien abre bien', async () => {
      await adjuntar(mp4(), 'estado.mp4', 'video/mp4');
      actor = ESTUDIANTE;

      const { body, status } = await abrirFicha();

      expect(status).toBe(200);
      expect(body.photos).toEqual([]);
      expect(body.video).not.toBeNull();
    });
  });

  describe('La ficha del estudiante no lleva el rastro administrativo', () => {
    it('el estudiante no recibe los campos de funcionario', async () => {
      actor = ESTUDIANTE;

      const { body } = await abrirFicha();

      for (const campo of CAMPOS_DE_FUNCIONARIO) {
        expect(Object.hasOwn(body, campo)).toBe(false);
      }
    });

    it('pero si recibe todo lo que necesita para decidir si pujar', async () => {
      actor = ESTUDIANTE;

      const { body } = await abrirFicha();

      expect(Object.keys(body).sort()).toEqual(
        [
          'category',
          'condition',
          'description',
          'id',
          'lotId',
          'name',
          'photos',
          'registeredAt',
          'roundId',
          'status',
          'video',
        ].sort(),
      );
    });

    it('el funcionario sigue recibiendo la ficha completa, con su version', async () => {
      actor = FUNCIONARIO;

      const { body } = await abrirFicha();

      for (const campo of CAMPOS_DE_FUNCIONARIO) {
        expect(Object.hasOwn(body, campo)).toBe(true);
      }
      expect(body.version).toBe(0);
      expect(body.registeredBy).toBe('funcionario-1');
    });

    it('el recorte no le quita al estudiante la multimedia', async () => {
      await adjuntar(jpeg(), 'frente.jpg', 'image/jpeg');
      await adjuntar(mp4(), 'estado.mp4', 'video/mp4');
      actor = ESTUDIANTE;

      const { body } = await abrirFicha();

      expect(body.photos).toHaveLength(1);
      expect(body.video).not.toBeNull();
    });
  });
});
