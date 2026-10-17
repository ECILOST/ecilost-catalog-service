import { Module } from '@nestjs/common';
import { MysteryController } from './mystery.controller.js';
import { MysteryService } from './mystery.service.js';

@Module({ controllers: [MysteryController], providers: [MysteryService] })
export class MysteryModule {}
