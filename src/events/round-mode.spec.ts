import { describe, expect, it, vi } from 'vitest';
import { applyRoundMode } from './round-mode.js';

function transaction(count = 1) {
  return {
    item: { updateMany: vi.fn().mockResolvedValue({ count }) },
    lot: { updateMany: vi.fn().mockResolvedValue({ count }) },
  };
}

describe('applyRoundMode (ADR-0002)', () => {
  it('lote misterioso: oculta el objeto, solo si sigue reservado por esa ronda', async () => {
    const tx = transaction();
    await expect(applyRoundMode(tx as never, { roundId: 'r1', mode: 'MYSTERY', entries: [{ kind: 'ITEM', catalogId: 'i1' }] }))
      .resolves.toEqual({ items: 1, lots: 0, mystery: true });
    expect(tx.item.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', roundId: 'r1' }, data: { mystery: true } });
  });

  it('un lote misterioso se oculta entero: el lote y sus objetos', async () => {
    const tx = transaction(2);
    await applyRoundMode(tx as never, { roundId: 'r1', mode: 'MYSTERY', entries: [{ kind: 'LOT', catalogId: 'l1' }] });
    expect(tx.lot.updateMany).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { mystery: true } });
    expect(tx.item.updateMany).toHaveBeenCalledWith({ where: { lotId: 'l1', roundId: 'r1' }, data: { mystery: true } });
  });

  it('cualquier otro modo vuelve a mostrarlo (la ronda dejo de ser misteriosa)', async () => {
    const tx = transaction();
    await applyRoundMode(tx as never, { roundId: 'r1', mode: 'CLASSIC', entries: [{ kind: 'ITEM', catalogId: 'i1' }] });
    expect(tx.item.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', roundId: 'r1' }, data: { mystery: false } });
  });

  it('un comodin (sin modo) no toca nada', async () => {
    const tx = transaction();
    await expect(applyRoundMode(tx as never, { roundId: 'r1', mode: null, entries: [{ kind: 'ITEM', catalogId: 'i1' }] }))
      .resolves.toEqual({ items: 0, lots: 0 });
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
});
