import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LotExclusivityError, LotsService } from './lots.service.js';

describe('LotsService.findAll', () => {
  it('sin ids devuelve todos, como siempre', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new LotsService({ lot: { findMany } } as never).findAll();
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('con ids pide solo esos lotes, en una consulta', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new LotsService({ lot: { findMany } } as never).findAll(['a', 'b']);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: ['a', 'b'] } });
  });
});

describe('LotsService writes and lookup', () => {
  const lot = { id: 'lot-1', mystery: true, items: [{ awardedTo: 'winner' }] };
  const itemIds = ['item-1', 'item-2'];

  function setup() {
    const tx = {
      item: {
        findMany: vi.fn().mockResolvedValue(itemIds.map(id => ({ id }))),
        updateMany: vi.fn().mockResolvedValue({ count: itemIds.length }),
      },
      lot: {
        create: vi.fn().mockResolvedValue(lot),
        findUniqueOrThrow: vi.fn().mockResolvedValue(lot),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const findUnique = vi.fn().mockResolvedValue(lot);
    const findMany = vi.fn().mockResolvedValue([lot]);
    const transaction = vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx));
    const prisma = { $transaction: transaction, lot: { findUnique, findMany } };
    return { tx, transaction, findUnique, service: new LotsService(prisma as never) };
  }

  it('creates the lot and assigns only available items within one transaction', async () => {
    const { tx, transaction, service } = setup();
    await expect(service.create('Summer lot', itemIds, 'operator')).resolves.toEqual(lot);
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.lot.create).toHaveBeenCalledWith({ data: { name: 'Summer lot', createdBy: 'operator' } });
    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { id: { in: itemIds }, status: 'AVAILABLE', lotId: null, roundId: null },
      data: { status: 'IN_LOT', lotId: lot.id, version: { increment: 1 }, lastModifiedBy: 'operator' },
    });
    expect(tx.lot.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: lot.id }, include: { items: { orderBy: { registeredAt: 'asc' } } },
    });
  });

  it('does not create a lot when one requested item is missing', async () => {
    const { tx, service } = setup();
    tx.item.findMany.mockResolvedValue([{ id: itemIds[0] }]);
    await expect(service.create('Summer lot', itemIds, 'operator')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.lot.create).not.toHaveBeenCalled();
  });

  it('reports a conflict when another request assigned an item first', async () => {
    const { tx, service } = setup();
    tx.item.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.create('Summer lot', itemIds, 'operator')).rejects.toBeInstanceOf(LotExclusivityError);
    expect(tx.lot.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('lets an unexpected transaction error reach the caller', async () => {
    const { transaction, service } = setup();
    const error = new Error('database unavailable');
    transaction.mockRejectedValue(error);
    await expect(service.create('Summer lot', itemIds, 'operator')).rejects.toBe(error);
  });

  it('releases the existing members when an active lot is cancelled', async () => {
    const { tx, transaction, service } = setup();
    await service.releaseItems(lot.id, 'CANCELLED');
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.lot.updateMany).toHaveBeenCalledWith({
      where: { id: lot.id, status: 'ACTIVE' }, data: { status: 'CANCELLED' },
    });
    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { lotId: lot.id, status: 'IN_LOT' },
      data: { lotId: null, status: 'AVAILABLE', version: { increment: 1 } },
    });
  });

  it('does not release items when the lot is already inactive', async () => {
    const { tx, service } = setup();
    tx.lot.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.releaseItems(lot.id, 'CLOSED')).rejects.toBeInstanceOf(LotExclusivityError);
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });

  it('shows a mystery lot to its winner and treats hidden and missing lots as not found', async () => {
    const { findUnique, service } = setup();
    const winner = { userId: 'winner', canManageCatalog: false };
    const other = { userId: 'other', canManageCatalog: false };
    await expect(service.findAll(undefined, winner)).resolves.toEqual([lot]);
    await expect(service.findAll(undefined, other)).resolves.toEqual([]);
    await expect(service.findOne(lot.id, other)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findOne(lot.id, winner)).resolves.toEqual(lot);
    await expect(service.findOne(lot.id)).resolves.toEqual(lot);
    findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
