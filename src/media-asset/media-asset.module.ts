import { Module } from '@nestjs/common';
import { MediaAssetController } from './media-asset.controller.js';
import { MediaAssetService } from './media-asset.service.js';
import { MEDIA_ASSET_REPOSITORY } from './ports/media-asset.repository.js';
import { MEDIA_STORAGE } from './ports/media-storage.js';
import { PrismaMediaAssetRepository } from './repositories/prisma-media-asset.repository.js';
import { S3MediaStorage } from './storage/s3-media-storage.js';

/**
 * Multimedia del catalogo (HU-07).
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
    { provide: MEDIA_STORAGE, useClass: S3MediaStorage },
  ],
  exports: [MediaAssetService],
})
export class MediaAssetModule {}
