import { Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogConfig } from '../config/catalog.config.js';
import { releaseReservation, type ReservationCancelled } from './round-reservation-release.js';
import { ResilientConsumer } from './resilient-consumer.js';

type Entry = { kind: 'ITEM' | 'LOT'; catalogId: string; roundId: string };
type Request = { entries: Entry[] };

@Injectable()
export class RoundReservationConsumer extends ResilientConsumer {
  protected readonly logger = new Logger(RoundReservationConsumer.name);
  constructor(private readonly prisma: PrismaService, config: CatalogConfig) {
    super(() => config.rabbitmqUrl, {
      queue: 'ecilost.catalog.round-reservations',
      // La cancelacion comparte cola con la reserva y se procesa de a un mensaje: asi nunca se
      // adelanta a la reserva que anula, aunque auction la mande justo despues de un timeout.
      routingKeys: ['catalog.round-reservation.requested.v1', 'catalog.round-reservation.cancelled.v1'],
      prefetch: 1,
    });
  }

  protected async handle(message: amqp.ConsumeMessage, channel: amqp.Channel) {
    if (message.fields.routingKey === 'catalog.round-reservation.cancelled.v1') {
      await this.release(message, channel);
      return;
    }
    const replyTo = message.properties.replyTo; const correlationId = message.properties.correlationId;
    try {
      const accepted = await this.reserve(JSON.parse(message.content.toString()) as Request);
      if (replyTo) channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ accepted })), { correlationId });
      channel.ack(message);
    } catch (error) {
      this.logger.warn(`Reserva de ronda rechazada: ${error instanceof Error ? error.message : String(error)}`);
      if (replyTo) channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ accepted: false })), { correlationId });
      channel.ack(message);
    }
  }

  /** Orden compensatoria de auction. Se confirma despues de liberar; un fallo se reintenta una vez. */
  private async release(message: amqp.ConsumeMessage, channel: amqp.Channel) {
    try {
      const order = JSON.parse(message.content.toString()) as ReservationCancelled;
      const result = await this.prisma.$transaction((tx) => releaseReservation(tx, order));
      this.logger.log(`Reserva cancelada por auction: ${result.items} objetos y ${result.lots} lotes liberados.`);
      channel.ack(message);
    } catch (error) {
      const retry = !message.fields.redelivered;
      this.logger.error(`No se pudo liberar la reserva cancelada (${retry ? 'se reintenta' : 'se descarta'}): ${String(error)}`);
      channel.nack(message, false, retry);
    }
  }
  private async reserve(request: Request): Promise<boolean> {
    if (!request.entries.length || new Set(request.entries.map((x) => `${x.kind}:${x.catalogId}`)).size !== request.entries.length) return false;
    return this.prisma.$transaction(async (tx) => {
      for (const entry of request.entries.filter((x) => x.kind === 'ITEM')) {
        const changed = await tx.item.updateMany({ where: { id: entry.catalogId, status: 'AVAILABLE', roundId: null, lotId: null }, data: { status: 'IN_ROUND', roundId: entry.roundId, version: { increment: 1 } } });
        if (changed.count !== 1) throw new Error('objeto no disponible');
      }
      for (const entry of request.entries.filter((x) => x.kind === 'LOT')) {
        const changed = await tx.lot.updateMany({ where: { id: entry.catalogId, status: 'ACTIVE' }, data: { status: 'IN_ROUND' } });
        if (changed.count !== 1) throw new Error('lote no disponible');
        await tx.item.updateMany({ where: { lotId: entry.catalogId, status: 'IN_LOT', roundId: null }, data: { status: 'IN_ROUND', roundId: entry.roundId, version: { increment: 1 } } });
      }
      return true;
    });
  }
}
