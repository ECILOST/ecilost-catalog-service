import { Module } from '@nestjs/common';
import { LotsService } from './lots.service.js';
import { LotsController } from './lots.controller.js';

@Module({
  controllers: [LotsController],
  providers: [LotsService],
})
export class LotsModule {}
