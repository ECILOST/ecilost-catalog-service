import { describe, expect, it, vi } from 'vitest';
import { settleCatalogRound } from './round-settlement.js';

function transaction(count = 1) {
  return {
    item: { updateMany: vi.fn().mockResolvedValue({ count }) },
    lot: { updateMany: vi.fn().mockResolvedValue({ count }) },
  };
}

describe('settleCatalogRound', () => {
  it('una ronda adjudicada vende el objeto, solo si sigue reservado por esa ronda', async () => {
    const tx = transaction();

    await expect(
      settleCatalogRound(tx as never, { roundId: 'r1', result: 'AWARDED', entries: [{ kind: 'ITEM', catalogId: 'i1' }] }),
    ).resolves.toEqual({ awarded: true, items: 1, lots: 0 });

    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: 'IN_ROUND', roundId: 'r1' },
      data: { status: 'SOLD', version: { increment: 1 } },
    });
  });

  it('una ronda desierta devuelve el objeto al catalogo sin la marca de la ronda', async () => {
    const tx = transaction();

    await settleCatalogRound(tx as never, { roundId: 'r1', result: 'DESERTED', entries: [{ kind: 'ITEM', catalogId: 'i1' }] });

    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: 'IN_ROUND', roundId: 'r1' },
      data: { status: 'AVAILABLE', roundId: null, version: { increment: 1 } },
    });
  });

  it('un lote adjudicado se cierra y sus objetos se venden', async () => {
    const tx = transaction(2);

    await settleCatalogRound(tx as never, { roundId: 'r1', result: 'AWARDED', entries: [{ kind: 'LOT', catalogId: 'l1' }] });

    expect(tx.lot.updateMany).toHaveBeenCalledWith({ where: { id: 'l1', status: 'IN_ROUND' }, data: { status: 'CLOSED' } });
    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { lotId: 'l1', status: 'IN_ROUND', roundId: 'r1' },
      data: { status: 'SOLD', version: { increment: 1 } },
    });
  });

  it('un lote desierto vuelve a estar activo con sus objetos dentro', async () => {
    const tx = transaction(2);

    await settleCatalogRound(tx as never, { roundId: 'r1', result: 'DESERTED', entries: [{ kind: 'LOT', catalogId: 'l1' }] });

    expect(tx.lot.updateMany).toHaveBeenCalledWith({ where: { id: 'l1', status: 'IN_ROUND' }, data: { status: 'ACTIVE' } });
    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { lotId: 'l1', status: 'IN_ROUND', roundId: 'r1' },
      data: { status: 'IN_LOT', roundId: null, version: { increment: 1 } },
    });
  });

  it('sin `result` (eventos anteriores) decide por el lider al cerrar', async () => {
    const tx = transaction();

    await expect(
      settleCatalogRound(tx as never, { roundId: 'r1', currentBidderId: 'alice', entries: [{ kind: 'ITEM', catalogId: 'i1' }] }),
    ).resolves.toMatchObject({ awarded: true });
  });

  it('reprocesar el mismo cierre no cambia nada', async () => {
    const tx = transaction(0);

    await expect(
      settleCatalogRound(tx as never, { roundId: 'r1', result: 'AWARDED', entries: [{ kind: 'ITEM', catalogId: 'i1' }] }),
    ).resolves.toEqual({ awarded: true, items: 0, lots: 0 });
  });
});
