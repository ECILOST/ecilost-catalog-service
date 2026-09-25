import type { Prisma } from '../generated/prisma/client.js';

/** La orden compensatoria de auction: rondas de una sala que no llego a existir. */
export interface ReservationCancelled {
  rounds: Array<{ roundId: string; entries: Array<{ kind: 'ITEM' | 'LOT'; catalogId: string }> }>;
}

/**
 * Suelta lo que catalog reservo para rondas que auction no pudo guardar.
 *
 * Solo toca lo que siga reservado por ESAS rondas: la marca `roundId` del objeto es la
 * prueba. Un lote no tiene esa marca, asi que se reactiva unicamente si alguno de sus
 * objetos la tenia; si otra sala se lo habia llevado, sus objetos llevan otro `roundId` y el
 * lote no se toca. Por eso la orden es idempotente, e inofensiva si llega cuando catalog
 * habia rechazado la reserva.
 */
export async function releaseReservation(tx: Prisma.TransactionClient, order: ReservationCancelled) {
  let items = 0;
  let lots = 0;

  for (const { roundId, entries } of order.rounds) {
    for (const entry of entries) {
      if (entry.kind === 'ITEM') {
        const changed = await tx.item.updateMany({
          where: { id: entry.catalogId, status: 'IN_ROUND', roundId },
          data: { status: 'AVAILABLE', roundId: null, version: { increment: 1 } },
        });
        items += changed.count;
        continue;
      }

      const released = await tx.item.updateMany({
        where: { lotId: entry.catalogId, status: 'IN_ROUND', roundId },
        data: { status: 'IN_LOT', roundId: null, version: { increment: 1 } },
      });
      if (released.count === 0) continue;
      items += released.count;
      const lot = await tx.lot.updateMany({ where: { id: entry.catalogId, status: 'IN_ROUND' }, data: { status: 'ACTIVE' } });
      lots += lot.count;
    }
  }

  return { items, lots };
}
