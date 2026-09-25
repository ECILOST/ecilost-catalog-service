import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { CatalogConfig } from '../config/catalog.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { settleCatalogRound, type RoundClosedEvent } from './round-settlement.js';

const EXCHANGE = 'ecilost.events';
const KEY = 'auction.round.closed.v1';
const QUEUE = 'ecilost.catalog.round-settlements';

/**
 * Consume el cierre de cada ronda y vende o devuelve sus objetos (HU-28).
 *
 * Se confirma despues de la transaccion. Un fallo se reintenta una vez; si vuelve a fallar
 * se descarta con un error en el log para no bloquear la cola. Reprocesar es inofensivo.
 */
@Injectable()
export class RoundSettlementConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundSettlementConsumer.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(private readonly prisma: PrismaService, private readonly config: CatalogConfig) {}

  async onModuleInit() {
    this.connection = await amqp.connect(this.config.rabbitmqUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await this.channel.assertQueue(QUEUE, { durable: true });
    await this.channel.bindQueue(QUEUE, EXCHANGE, KEY);
    await this.channel.consume(QUEUE, (message) => void this.handle(message));
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handle(message: amqp.ConsumeMessage | null) {
    if (!message || !this.channel) return;
    try {
      const event = JSON.parse(message.content.toString()) as RoundClosedEvent;
      const result = await this.prisma.$transaction((tx) => settleCatalogRound(tx, event));
      this.logger.log(
        `Ronda ${event.roundId} ${result.awarded ? 'adjudicada' : 'desierta'}: ${result.items} objetos y ${result.lots} lotes actualizados.`,
      );
      this.channel.ack(message);
    } catch (error) {
      const retry = !message.fields.redelivered;
      this.logger.error(`No se pudo cerrar la ronda en catalog (${retry ? 'se reintenta' : 'se descarta'}): ${String(error)}`);
      this.channel.nack(message, false, retry);
    }
  }
}
