import { Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { CatalogConfig } from '../config/catalog.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResilientConsumer } from './resilient-consumer.js';
import { applyRoundMode, type RoundModeSelectedEvent } from './round-mode.js';

const KEY = 'auction.round.mode-selected.v1';
const QUEUE = 'ecilost.catalog.round-modes';

/**
 * Consume la ruleta de auction (ADR-0002): oculta los objetos de un lote misterioso desde que
 * sale en la ruleta, y los vuelve a mostrar si la ronda deja de serlo.
 *
 * Mismo trato de errores que la liquidacion: se confirma tras la transaccion, un fallo se
 * reintenta una vez y despues se descarta con el error en el log. Reprocesar es inofensivo.
 */
@Injectable()
export class RoundModeConsumer extends ResilientConsumer {
  protected readonly logger = new Logger(RoundModeConsumer.name);

  constructor(private readonly prisma: PrismaService, config: CatalogConfig) {
    super(() => config.rabbitmqUrl, { queue: QUEUE, routingKeys: [KEY] });
  }

  protected async handle(message: amqp.ConsumeMessage, channel: amqp.Channel) {
    try {
      const event = JSON.parse(message.content.toString()) as RoundModeSelectedEvent;
      const result = await this.prisma.$transaction((tx) => applyRoundMode(tx, event));
      if (event.mode !== null) {
        this.logger.log(
          `Ronda ${event.roundId} en modo ${event.mode}: ${result.items} objetos y ${result.lots} lotes ${result.mystery ? 'ocultos' : 'visibles'}.`,
        );
      }
      channel.ack(message);
    } catch (error) {
      const retry = !message.fields.redelivered;
      this.logger.error(`No se pudo aplicar el modo de la ronda en catalog (${retry ? 'se reintenta' : 'se descarta'}): ${String(error)}`);
      channel.nack(message, false, retry);
    }
  }
}
