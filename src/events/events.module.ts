import { Module } from '@nestjs/common';
import { RoundModeConsumer } from './round-mode.consumer.js';
import { RoundReservationConsumer } from './round-reservation.consumer.js';
import { RoundSettlementConsumer } from './round-settlement.consumer.js';
@Module({ providers: [RoundReservationConsumer, RoundSettlementConsumer, RoundModeConsumer] })
export class EventsModule {}
