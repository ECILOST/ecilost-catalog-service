import type { Channel, ConsumeMessage } from 'amqplib';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogConfig } from '../config/catalog.config.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RoundModeConsumer } from './round-mode.consumer.js';
import { RoundReservationConsumer } from './round-reservation.consumer.js';
import { RoundSettlementConsumer } from './round-settlement.consumer.js';

class ReservationConsumer extends RoundReservationConsumer {
  public override handle(message: ConsumeMessage, channel: Channel) {
    return super.handle(message, channel);
  }
}
class ModeConsumer extends RoundModeConsumer {
  public override handle(message: ConsumeMessage, channel: Channel) {
    return super.handle(message, channel);
  }
}
class SettlementConsumer extends RoundSettlementConsumer {
  public override handle(message: ConsumeMessage, channel: Channel) {
    return super.handle(message, channel);
  }
}

function setup() {
  const transaction = {
    item: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    lot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const runTransaction = vi.fn((run: (tx: typeof transaction) => Promise<unknown>) => run(transaction));
  const prisma = { $transaction: runTransaction } as unknown as PrismaService;
  const config = { rabbitmqUrl: 'amqp://test' } as CatalogConfig;
  const channel = { ack: vi.fn(), nack: vi.fn(), sendToQueue: vi.fn() };
  return { prisma, config, channel, broker: channel as unknown as Channel, transaction, runTransaction };
}

function delivery(routingKey: string, body: unknown, redelivered = false): ConsumeMessage {
  return {
    fields: { routingKey, redelivered },
    properties: { replyTo: 'replies', correlationId: 'request-1' },
    content: Buffer.from(JSON.stringify(body)),
  } as ConsumeMessage;
}

const reservationKey = 'catalog.round-reservation.requested.v1';
const cancellationKey = 'catalog.round-reservation.cancelled.v1';

describe('catalog round event delivery', () => {
  it('reserves standalone items and lots in one transaction and replies with the correlation id', async () => {
    const { prisma, config, broker, channel, transaction, runTransaction } = setup();
    const message = delivery(reservationKey, { entries: [
      { kind: 'ITEM', catalogId: 'item-1', roundId: 'round-1' },
      { kind: 'LOT', catalogId: 'lot-1', roundId: 'round-2' },
    ] });

    await new ReservationConsumer(prisma, config).handle(message, broker);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'item-1', status: 'AVAILABLE' }),
      data: expect.objectContaining({ status: 'IN_ROUND', roundId: 'round-1' }),
    }));
    expect(transaction.lot.updateMany).toHaveBeenCalledWith({
      where: { id: 'lot-1', status: 'ACTIVE' }, data: { status: 'IN_ROUND' },
    });
    expect(transaction.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lotId: 'lot-1', status: 'IN_LOT' }),
      data: expect.objectContaining({ roundId: 'round-2' }),
    }));
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'replies', Buffer.from(JSON.stringify({ accepted: true })), { correlationId: 'request-1' },
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('rejects duplicate entries without starting a transaction', async () => {
    const { prisma, config, broker, channel, runTransaction } = setup();
    const item = { kind: 'ITEM', catalogId: 'item-1', roundId: 'round-1' };
    const message = delivery(reservationKey, { entries: [item, item] });
    await new ReservationConsumer(prisma, config).handle(message, broker);

    expect(runTransaction).not.toHaveBeenCalled();
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'replies', Buffer.from(JSON.stringify({ accepted: false })), { correlationId: 'request-1' },
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('rejects a reservation if the item is unavailable', async () => {
    const { prisma, config, broker, channel, transaction } = setup();
    transaction.item.updateMany.mockResolvedValue({ count: 0 });
    const message = delivery(reservationKey, { entries: [
      { kind: 'ITEM', catalogId: 'item-1', roundId: 'round-1' },
    ] });
    await new ReservationConsumer(prisma, config).handle(message, broker);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'replies', Buffer.from(JSON.stringify({ accepted: false })), { correlationId: 'request-1' },
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('applies a mystery mode change before acknowledging it', async () => {
    const { prisma, config, broker, channel, transaction } = setup();
    const message = delivery('auction.round.mode-selected.v1', {
      roundId: 'round-1', mode: 'MYSTERY', entries: [{ kind: 'ITEM', catalogId: 'item-1' }],
    });
    await new ModeConsumer(prisma, config).handle(message, broker);

    expect(transaction.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', roundId: 'round-1' }, data: { mystery: true },
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it.each([false, true])('requeues a failed transaction at most once (redelivered: %s)', async (redelivered) => {
    const { prisma, config, broker, channel, runTransaction } = setup();
    runTransaction.mockRejectedValue(new Error('database unavailable'));
    const cases = [
      [new ReservationConsumer(prisma, config), cancellationKey],
      [new ModeConsumer(prisma, config), 'auction.round.mode-selected.v1'],
      [new SettlementConsumer(prisma, config), 'auction.round.closed.v1'],
    ] as const;

    for (const [consumer, key] of cases) {
      const message = delivery(key, {}, redelivered);
      await consumer.handle(message, broker);
      expect(channel.nack).toHaveBeenCalledWith(message, false, !redelivered);
    }
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
