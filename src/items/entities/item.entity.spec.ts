import { describe, expect, it } from 'vitest';
import type { ItemStatus } from '../../generated/prisma/enums.js';
import {
  canBeDeleted,
  canStaffTransition,
  deletionBlocker,
  type Item,
} from './item.entity.js';

const LOT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROUND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Subject = Pick<Item, 'status' | 'roundId' | 'lotId'>;

function item(overrides: Partial<Subject> = {}): Subject {
  return { status: 'AVAILABLE', roundId: null, lotId: null, ...overrides };
}

describe('deletionBlocker', () => {
  it('no bloquea un objeto libre y disponible', () => {
    expect(deletionBlocker(item())).toBeNull();
    expect(canBeDeleted(item())).toBe(true);
  });

  it('no bloquea un objeto retirado del catalogo', () => {
    // Retirar no compromete nada: el funcionario aun puede deshacerse de el.
    expect(canBeDeleted(item({ status: 'WITHDRAWN' }))).toBe(true);
  });

  it('bloquea por ronda y dice cual es, que es lo que pide el criterio', () => {
    const blocker = deletionBlocker(item({ status: 'IN_ROUND', roundId: ROUND_ID }));

    expect(blocker).toEqual({ reason: 'IN_ROUND', roundId: ROUND_ID });
  });

  it('bloquea por lote y dice cual es', () => {
    const blocker = deletionBlocker(item({ status: 'IN_LOT', lotId: LOT_ID }));

    expect(blocker).toEqual({ reason: 'IN_LOT', lotId: LOT_ID });
  });

  it('bloquea un objeto vendido, aunque ya no cuelgue de ninguna ronda', () => {
    // Borrarlo eliminaria la evidencia de una adjudicacion.
    expect(deletionBlocker(item({ status: 'SOLD' }))).toEqual({ reason: 'SOLD' });
  });

  it('la ronda tiene precedencia sobre el lote cuando ambos aplican', () => {
    // Un objeto de un lote que entro a subasta arrastra los dos identificadores. Se
    // informa el mas inmediato, que es la ronda en curso.
    const blocker = deletionBlocker(
      item({ status: 'IN_ROUND', roundId: ROUND_ID, lotId: LOT_ID }),
    );

    expect(blocker).toEqual({ reason: 'IN_ROUND', roundId: ROUND_ID });
  });
});

describe('canStaffTransition', () => {
  it('permite retirar un objeto disponible', () => {
    expect(canStaffTransition('AVAILABLE', 'WITHDRAWN')).toBe(true);
  });

  it('permite reponer un objeto retirado', () => {
    expect(canStaffTransition('WITHDRAWN', 'AVAILABLE')).toBe(true);
  });

  it.each<[ItemStatus, ItemStatus]>([
    ['AVAILABLE', 'IN_ROUND'],
    ['AVAILABLE', 'SOLD'],
    ['AVAILABLE', 'IN_LOT'],
    ['WITHDRAWN', 'SOLD'],
  ])('rechaza escribir %s -> %s a mano', (from, to) => {
    // Esos estados los mueven la HU-05, auction-service y la adjudicacion, nunca el
    // formulario de edicion.
    expect(canStaffTransition(from, to)).toBe(false);
  });

  it.each<ItemStatus>(['IN_LOT', 'IN_ROUND', 'SOLD'])(
    'no deja salir de %s por edicion manual',
    (from) => {
      expect(canStaffTransition(from, 'AVAILABLE')).toBe(false);
      expect(canStaffTransition(from, 'WITHDRAWN')).toBe(false);
    },
  );

  it.each<ItemStatus>(['AVAILABLE', 'WITHDRAWN', 'IN_LOT', 'IN_ROUND', 'SOLD'])(
    'admite %s -> %s, que no es un cambio',
    (status) => {
      // Un PATCH que reenvia el estado actual junto con otros campos no debe fallar.
      expect(canStaffTransition(status, status)).toBe(true);
    },
  );
});
