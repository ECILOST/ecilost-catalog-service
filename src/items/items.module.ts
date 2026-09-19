import { Module } from '@nestjs/common';
import { MediaAssetModule } from '../media-asset/media-asset.module.js';
import { ITEM_REPOSITORY } from './ports/item.repository.js';
import { PrismaItemRepository } from './repositories/prisma-item.repository.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';

@Module({
  // La ficha de un objeto incluye su multimedia (HU-07, HU-08), asi que la consulta
  // necesita al modulo que la administra. La dependencia va en un solo sentido: el modulo
  // de multimedia no conoce este.
  imports: [MediaAssetModule],
  controllers: [ItemsController],
  providers: [
    ItemsService,
    // El caso de uso depende del puerto, no de Prisma. Cambiar de motor se resuelve aqui.
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
  ],
  exports: [ItemsService],
})
export class ItemsModule {}
