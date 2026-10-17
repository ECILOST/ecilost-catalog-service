import { Module } from '@nestjs/common';
import { LotsService } from './lots.service.js';
import { LotsController } from './lots.controller.js';
import { MediaAssetModule } from '../media-asset/media-asset.module.js';
import { LotPhotoController } from './photos/lot-photo.controller.js';
import { LotPhotoService } from './photos/lot-photo.service.js';

@Module({
  // MediaAssetModule presta el almacen (MEDIA_STORAGE) para las fotografias del lote.
  imports: [MediaAssetModule],
  controllers: [LotsController, LotPhotoController],
  providers: [LotsService, LotPhotoService],
})
export class LotsModule {}
