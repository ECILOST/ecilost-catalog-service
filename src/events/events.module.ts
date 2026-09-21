import { Module } from '@nestjs/common';
import { RoundReservationConsumer } from './round-reservation.consumer.js';
@Module({ providers: [RoundReservationConsumer] })
export class EventsModule {}
