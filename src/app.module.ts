import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ItemsModule } from './items/items.module.js';
import { LotsModule } from './lots/lots.module.js';
import { ItemPatchModule } from './item-patch/item-patch.module.js';
import { MediaAssetModule } from './media-asset/media-asset.module.js';

@Module({
  imports: [
    // Van primero: los dos son @Global y el resto de modulos depende de ellos.
    AppConfigModule,
    PrismaModule,
    ItemsModule,
    LotsModule,
    ItemPatchModule,
    MediaAssetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
