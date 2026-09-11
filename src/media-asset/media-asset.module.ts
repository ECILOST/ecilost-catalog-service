import { Module } from '@nestjs/common';
import { MediaAssetService } from './media-asset.service.js';
import { MediaAssetController } from './media-asset.controller.js';

@Module({
  controllers: [MediaAssetController],
  providers: [MediaAssetService],
})
export class MediaAssetModule {}
