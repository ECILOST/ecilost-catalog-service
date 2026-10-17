import type { LotStatus } from '../../generated/prisma/enums.js';
import type { Item } from '../../items/entities/item.entity.js';

export interface Lot {
  id: string;
  name: string;
  status: LotStatus;
  createdBy: string;
  createdAt: Date;
  /** Oculto por un lote misterioso (ADR-0002). */
  mystery: boolean;
  items: Item[];
}

/**
 * Lote misterioso (ADR-0002): mientras su ronda lo oculta, el estudiante no lo ve. Se le
 * revela a quien gano sus objetos.
 */
export function isLotHiddenFrom(
  lot: { mystery: boolean; items: Array<{ awardedTo: string | null }> },
  viewer: { userId: string; canManageCatalog: boolean },
): boolean {
  return lot.mystery && !viewer.canManageCatalog && !lot.items.some((item) => item.awardedTo === viewer.userId);
}
