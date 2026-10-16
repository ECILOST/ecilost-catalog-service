import { describe, expect, it, vi } from 'vitest';
import { isHiddenFrom } from '../items/entities/item.entity.js';
import { isLotHiddenFrom } from '../lots/entities/lot.entity.js';
import { MysteryService } from './mystery.service.js';

const student = { userId: 'ana', canManageCatalog: false };
const staff = { userId: 'func', canManageCatalog: true };

describe('visibilidad del lote misterioso (ADR-0002)', () => {
  it('el estudiante no ve un objeto oculto; el ganador y el funcionario si', () => {
    const hidden = { mystery: true, awardedTo: null };
    expect(isHiddenFrom(hidden, student)).toBe(true);
    expect(isHiddenFrom(hidden, staff)).toBe(false);
    expect(isHiddenFrom({ mystery: true, awardedTo: 'ana' }, student)).toBe(false);
    expect(isHiddenFrom({ mystery: true, awardedTo: 'bob' }, student)).toBe(true);
    expect(isHiddenFrom({ mystery: false, awardedTo: null }, student)).toBe(false);
  });

  it('un lote misterioso se revela a quien gano sus objetos', () => {
    expect(isLotHiddenFrom({ mystery: true, items: [{ awardedTo: null }] }, student)).toBe(true);
    expect(isLotHiddenFrom({ mystery: true, items: [{ awardedTo: 'ana' }] }, student)).toBe(false);
    expect(isLotHiddenFrom({ mystery: true, items: [{ awardedTo: null }] }, staff)).toBe(false);
  });
});

describe('MysteryService (ADR-0002)', () => {
  it('entrega categoria, condicion y pistas, nunca nombre, descripcion, fotos ni id', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { lotId: null, category: 'Electronica', condition: 'GOOD', clues: ['Encontrado en bloque G'] },
      { lotId: 'l1', category: 'Ropa', condition: 'FAIR', clues: ['Talla M'] },
      { lotId: 'l1', category: 'Ropa', condition: 'GOOD', clues: ['Talla M', 'Color azul'] },
    ]);
    const service = new MysteryService({ item: { findMany } } as never);
    const result = await service.cluesForRound('r1');
    expect(findMany.mock.calls[0][0].where).toEqual({ roundId: 'r1', mystery: true });
    expect(findMany.mock.calls[0][0].select).toEqual({ lotId: true, category: true, condition: true, clues: true });
    expect(result).toEqual({
      roundId: 'r1',
      entries: [
        { kind: 'ITEM', category: 'Electronica', condition: 'GOOD', clues: ['Encontrado en bloque G'] },
        { kind: 'LOT', itemCount: 2, categories: ['Ropa'], clues: ['Talla M', 'Color azul'] },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('l1');
  });
});
