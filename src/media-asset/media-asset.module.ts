import { Module } from '@nestjs/common';
import { CatalogConfig } from '../config/catalog.config.js';
import { MediaAssetController } from './media-asset.controller.js';
import { MediaAssetService } from './media-asset.service.js';
import { MEDIA_ASSET_REPOSITORY } from './ports/media-asset.repository.js';
import { MEDIA_STORAGE } from './ports/media-storage.js';
import { PrismaMediaAssetRepository } from './repositories/prisma-media-asset.repository.js';
import { CachingMediaStorage } from './storage/caching-media-storage.js';
import { S3MediaStorage } from './storage/s3-media-storage.js';

/**
 * Multimedia del catalogo (HU-07, HU-08).
 *
 * No importa ItemsModule a proposito, aunque sus rutas cuelguen de un objeto: la relacion
 * la arbitra la clave foranea, y mantener la dependencia en un solo sentido es lo que
 * permite que ItemsModule importe este para armar la ficha sin abrir un ciclo.
 */
@Module({
  controllers: [MediaAssetController],
  providers: [
    MediaAssetService,
    // El caso de uso depende de los dos puertos, no de Prisma ni del SDK de S3. Cambiar de
    // motor o de almacen se resuelve aqui.
    { provide: MEDIA_ASSET_REPOSITORY, useClass: PrismaMediaAssetRepository },

    {
      provide: MEDIA_STORAGE,
      // Lo que ve el caso de uso es el almacen ya decorado con la cache de enlaces
      // (HU-08). El decorador implementa el mismo puerto, asi que nada aguas arriba se
      // entera, y quitarlo es borrar esta envoltura.
      //
      // La pareja se arma aqui dentro y el adaptador de S3 no se registra como proveedor
      // suelto: si lo estuviera, Nest tendria que construirlo tambien en las pruebas que
      // sustituyen MEDIA_STORAGE por un doble, y esas pruebas no tienen configuracion de
      // almacen que darle. Su onModuleInit lo reenvia el propio decorador.
      useFactory: (config: CatalogConfig) =>
        new CachingMediaStorage(new S3MediaStorage(config)),
      inject: [CatalogConfig],
    },
  ],
  exports: [MediaAssetService],
})
export class MediaAssetModule {}
