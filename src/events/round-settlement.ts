import type { Prisma } from '../generated/prisma/client.js';

/** Lo que catalog necesita del cierre de una ronda que publica auction. */
export interface RoundClosedEvent {
  roundId: string;
  entries: Array<{ kind: 'ITEM' | 'LOT'; catalogId: string }>;
  /** `AWARDED` o `DESERTED`. Eventos anteriores a HU-28 no lo traen. */
  result?: 'AWARDED' | 'DESERTED';
  /** Ganador (HU-28). Eventos anteriores no lo traen: el lider al cerrar es el ganador. */
  winnerId?: string | null;
  /** Lider al cerrar; sirve de respaldo cuando no viene `result`. */
  currentBidderId?: string | null;
}

/**
 * Cierra en catalog lo que auction adjudico o declaro desierto.
 *
 * - Adjudicada: los objetos pasan a SOLD y el lote a CLOSED. Se anota a quien se adjudico:
 *   un objeto de lote misterioso solo se le revela a el (ADR-0002).
 * - Desierta: los objetos vuelven a estar disponibles (sueltos, o dentro de su lote, que
 *   vuelve a ACTIVE), sin la marca de la ronda y sin el misterio, que era de esa ronda.
 *
 * Cada cambio va condicionado a que el objeto siga reservado por ESTA ronda, asi que
 * procesar dos veces el mismo evento no cambia nada la segunda vez.
 */
export async function settleCatalogRound(tx: Prisma.TransactionClient, event: RoundClosedEvent) {
  const awarded = event.result ? event.result === 'AWARDED' : Boolean(event.currentBidderId);
  const winnerId = event.winnerId !== undefined ? event.winnerId : (event.currentBidderId ?? null);
  const { roundId } = event;
  let items = 0;
  let lots = 0;

  for (const entry of event.entries) {
    if (entry.kind === 'ITEM') {
      const changed = await tx.item.updateMany({
        where: { id: entry.catalogId, status: 'IN_ROUND', roundId },
        data: awarded
          ? { status: 'SOLD', awardedTo: winnerId, version: { increment: 1 } }
          : { status: 'AVAILABLE', roundId: null, mystery: false, version: { increment: 1 } },
      });
      items += changed.count;
      continue;
    }

    const lot = await tx.lot.updateMany({
      where: { id: entry.catalogId, status: 'IN_ROUND' },
      data: awarded ? { status: 'CLOSED' } : { status: 'ACTIVE', mystery: false },
    });
    lots += lot.count;
    const changed = await tx.item.updateMany({
      where: { lotId: entry.catalogId, status: 'IN_ROUND', roundId },
      data: awarded
        ? { status: 'SOLD', awardedTo: winnerId, version: { increment: 1 } }
        : { status: 'IN_LOT', roundId: null, mystery: false, version: { increment: 1 } },
    });
    items += changed.count;
  }

  return { awarded, items, lots };
}
