import type { ItemStatus } from '../../generated/prisma/enums.js';
import type { ItemModel } from '../../generated/prisma/models.js';

/** Objeto perdido del catalogo. La forma del dato la manda prisma/schema.prisma. */
export type Item = ItemModel;

/** Motivo por el que un objeto no se puede borrar. */
export type DeletionBlocker =
  | { reason: 'IN_ROUND'; roundId: string }
  | { reason: 'IN_LOT'; lotId: string }
  | { reason: 'SOLD' };

/**
 * HU-04: un objeto comprometido no se borra, y hay que poder decir que lo bloquea.
 *
 * El criterio solo nombra la ronda activa. El lote y la venta se agregan por coherencia:
 * borrar un objeto que esta dentro de un lote dejaria al lote mintiendo, y borrar uno
 * vendido borraria la evidencia de una adjudicacion.
 */
export function deletionBlocker(
  item: Pick<Item, 'status' | 'roundId' | 'lotId'>,
): DeletionBlocker | null {
  if (item.roundId !== null) return { reason: 'IN_ROUND', roundId: item.roundId };
  if (item.lotId !== null) return { reason: 'IN_LOT', lotId: item.lotId };
  if (item.status === 'SOLD') return { reason: 'SOLD' };
  return null;
}

export function canBeDeleted(item: Pick<Item, 'status' | 'roundId' | 'lotId'>): boolean {
  return deletionBlocker(item) === null;
}

/**
 * Transiciones de estado que el funcionario hace a mano (HU-04).
 *
 * Solo retirar y reponer. IN_LOT lo mueve la HU-05 al armar un lote, IN_ROUND lo mueve
 * auction-service al programar la ronda, y SOLD lo mueve la adjudicacion. Dejar que se
 * escriban a mano permitiria declarar vendido un objeto que nadie compro.
 */
const STAFF_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  AVAILABLE: ['WITHDRAWN'],
  WITHDRAWN: ['AVAILABLE'],
  IN_LOT: [],
  IN_ROUND: [],
  SOLD: [],
};

export function canStaffTransition(from: ItemStatus, to: ItemStatus): boolean {
  return from === to || STAFF_TRANSITIONS[from].includes(to);
}
