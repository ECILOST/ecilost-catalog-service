import { Module } from '@nestjs/common';
import { RoundReservationConsumer } from './round-reservation.consumer.js';
import { RoundSettlementConsumer } from './round-settlement.consumer.js';
@Module({ providers: [RoundReservationConsumer, RoundSettlementConsumer] })
export class EventsModule {}
