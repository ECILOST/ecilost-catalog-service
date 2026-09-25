import { describe, expect, it, vi } from 'vitest';
import { releaseReservation } from './round-reservation-release.js';

const transaction = (items = 1, lots = 1) => ({
  item: { updateMany: vi.fn().mockResolvedValue({ count: items }) },
  lot: { updateMany: vi.fn().mockResolvedValue({ count: lots }) },
});

describe('releaseReservation', () => {
  it('devuelve el objeto a disponible solo si sigue reservado por esa ronda', async () => {
    const tx = transaction();

    await expect(
      releaseReservation(tx as never, { rounds: [{ roundId: 'r1', entries: [{ kind: 'ITEM', catalogId: 'i1' }] }] }),
    ).resolves.toEqual({ items: 1, lots: 0 });

    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: 'IN_ROUND', roundId: 'r1' },
      data: { status: 'AVAILABLE', roundId: null, version: { increment: 1 } },
    });
  });

  it('reactiva un lote cuando sus objetos llevaban la marca de esa ronda', async () => {
    const tx = transaction(2, 1);

    await expect(
      releaseReservation(tx as never, { rounds: [{ roundId: 'r1', entries: [{ kind: 'LOT', catalogId: 'l1' }] }] }),
    ).resolves.toEqual({ items: 2, lots: 1 });

    expect(tx.item.updateMany).toHaveBeenCalledWith({
      where: { lotId: 'l1', status: 'IN_ROUND', roundId: 'r1' },
      data: { status: 'IN_LOT', roundId: null, version: { increment: 1 } },
    });
    expect(tx.lot.updateMany).toHaveBeenCalledWith({ where: { id: 'l1', status: 'IN_ROUND' }, data: { status: 'ACTIVE' } });
  });

  it('no toca un lote que otra sala se llevo: sus objetos llevan otra marca', async () => {
    const tx = transaction(0);

    await releaseReservation(tx as never, { rounds: [{ roundId: 'r1', entries: [{ kind: 'LOT', catalogId: 'l1' }] }] });

    expect(tx.lot.updateMany).not.toHaveBeenCalled();
  });

  it('repetir la orden, o recibirla cuando la reserva se habia rechazado, no cambia nada', async () => {
    const tx = transaction(0, 0);

    await expect(
      releaseReservation(tx as never, { rounds: [{ roundId: 'r1', entries: [{ kind: 'ITEM', catalogId: 'i1' }, { kind: 'LOT', catalogId: 'l1' }] }] }),
    ).resolves.toEqual({ items: 0, lots: 0 });
  });
});
