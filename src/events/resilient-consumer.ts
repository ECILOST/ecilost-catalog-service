import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

const EXCHANGE = 'ecilost.events';
const RETRY_DELAY_MS = 5_000;

export interface ConsumerBinding {
  queue: string;
  routingKeys: string[];
  /** Mensajes en vuelo a la vez. Sin valor, RabbitMQ no limita. */
  prefetch?: number;
}

/**
 * Consumidor de `ecilost.events` que sobrevive a RabbitMQ.
 *
 * Conectar una sola vez en `onModuleInit` tenia dos fallos: si RabbitMQ no respondia al
 * arrancar, catalog entero no levantaba; y si la conexion se caia despues, el consumidor
 * quedaba muerto sin avisar. Ni las reservas de las salas ni el cierre de las rondas se
 * procesaban hasta reiniciar el contenedor, y los objetos quedaban "En subasta".
 *
 * Aqui la conexion se reintenta cada pocos segundos, al arrancar y cada vez que se cae. Los
 * mensajes pendientes esperan en la cola durable mientras tanto.
 */
export abstract class ResilientConsumer implements OnModuleInit, OnModuleDestroy {
  protected abstract readonly logger: Logger;
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private retry?: NodeJS.Timeout;
  private connecting = false;
  private stopped = false;

  protected constructor(
    private readonly rabbitmqUrl: () => string,
    private readonly binding: ConsumerBinding,
  ) {}

  /**
   * Procesa un mensaje. Debe confirmarlo (`ack`/`nack`) sobre `channel`, que es el canal
   * por el que llego: tras una reconexion el anterior ya no sirve.
   */
  protected abstract handle(message: amqp.ConsumeMessage, channel: amqp.Channel): Promise<void>;

  onModuleInit(): void {
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || this.channel) return;
    this.connecting = true;
    const { queue, routingKeys, prefetch } = this.binding;
    try {
      const connection = await amqp.connect(this.rabbitmqUrl());
      this.connection = connection;
      connection.on('error', (error: unknown) => this.logger.warn(`Error en la conexion con RabbitMQ: ${String(error)}`));
      connection.on('close', () => this.resetAndRetry());
      const channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await channel.assertQueue(queue, { durable: true });
      for (const routingKey of routingKeys) await channel.bindQueue(queue, EXCHANGE, routingKey);
      if (prefetch) await channel.prefetch(prefetch);
      await channel.consume(queue, async (message) => {
        if (message) await this.handle(message, channel);
      });
      this.channel = channel;
      this.logger.log(`Consumiendo ${routingKeys.join(', ')} desde ${queue}`);
    } catch (error) {
      this.logger.warn(`No fue posible conectar a RabbitMQ; se reintenta en ${RETRY_DELAY_MS / 1000} s: ${String(error)}`);
      await this.connection?.close().catch(() => undefined);
      this.resetAndRetry();
    } finally {
      this.connecting = false;
    }
  }

  private resetAndRetry(): void {
    this.channel = undefined;
    this.connection = undefined;
    if (this.stopped) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.connect(), RETRY_DELAY_MS);
  }
}
