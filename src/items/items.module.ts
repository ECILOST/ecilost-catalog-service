import { Module } from '@nestjs/common';
import { ITEM_REPOSITORY } from './ports/item.repository.js';
import { PrismaItemRepository } from './repositories/prisma-item.repository.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';

@Module({
  controllers: [ItemsController],
  providers: [
    ItemsService,
    // El caso de uso depende del puerto, no de Prisma. Cambiar de motor se resuelve aqui.
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
  ],
  exports: [ItemsService],
})
export class ItemsModule {}
