import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ItemsModule } from './items/items.module.js';
import { LotsModule } from './lots/lots.module.js';
import { ItemPatchModule } from './item-patch/item-patch.module.js';
import { MediaAssetModule } from './media-asset/media-asset.module.js';

@Module({
  imports: [ItemsModule, LotsModule, ItemPatchModule, MediaAssetModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
