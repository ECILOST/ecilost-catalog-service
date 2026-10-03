import { Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { CatalogConfig } from '../config/catalog.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResilientConsumer } from './resilient-consumer.js';
import { settleCatalogRound, type RoundClosedEvent } from './round-settlement.js';

const KEY = 'auction.round.closed.v1';
const QUEUE = 'ecilost.catalog.round-settlements';

/**
 * Consume el cierre de cada ronda y vende o devuelve sus objetos (HU-28).
 *
 * Se confirma despues de la transaccion. Un fallo se reintenta una vez; si vuelve a fallar
 * se descarta con un error en el log para no bloquear la cola. Reprocesar es inofensivo.
 */
@Injectable()
export class RoundSettlementConsumer extends ResilientConsumer {
  protected readonly logger = new Logger(RoundSettlementConsumer.name);

  constructor(private readonly prisma: PrismaService, config: CatalogConfig) {
    super(() => config.rabbitmqUrl, { queue: QUEUE, routingKeys: [KEY] });
  }

  protected async handle(message: amqp.ConsumeMessage, channel: amqp.Channel) {
    try {
      const event = JSON.parse(message.content.toString()) as RoundClosedEvent;
      const result = await this.prisma.$transaction((tx) => settleCatalogRound(tx, event));
      this.logger.log(
        `Ronda ${event.roundId} ${result.awarded ? 'adjudicada' : 'desierta'}: ${result.items} objetos y ${result.lots} lotes actualizados.`,
      );
      channel.ack(message);
    } catch (error) {
      const retry = !message.fields.redelivered;
      this.logger.error(`No se pudo cerrar la ronda en catalog (${retry ? 'se reintenta' : 'se descarta'}): ${String(error)}`);
      channel.nack(message, false, retry);
    }
  }
}
