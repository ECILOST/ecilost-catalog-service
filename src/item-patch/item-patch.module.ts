import { Module } from '@nestjs/common';
import { ItemPatchService } from './item-patch.service.js';
import { ItemPatchController } from './item-patch.controller.js';

@Module({
  controllers: [ItemPatchController],
  providers: [ItemPatchService],
})
export class ItemPatchModule {}
