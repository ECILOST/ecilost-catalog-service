import type { Prisma } from '../generated/prisma/client.js';

/** `auction.round.mode-selected.v1`: la ruleta de auction decidio como se juega una ronda. */
export interface RoundModeSelectedEvent {
  roundId: string;
  /** `null` si salio comodin: la ronda aun no tiene modo y aqui no hay nada que cambiar. */
  mode: 'CLASSIC' | 'DUTCH' | 'SEALED' | 'MYSTERY' | null;
  entries: Array<{ kind: 'ITEM' | 'LOT'; catalogId: string }>;
}

/**
 * Oculta los objetos de una ronda que salio como lote misterioso (ADR-0002), o los vuelve a
 * mostrar si la ronda dejo de serlo (el dueño desactivo la ruleta).
 *
 * Solo toca lo que siga reservado por ESA ronda (`roundId`), igual que la liberacion de
 * reservas: un objeto que ya cambio de ronda no se oculta por un evento viejo. Reprocesar el
 * evento deja todo igual.
 */
export async function applyRoundMode(tx: Prisma.TransactionClient, event: RoundModeSelectedEvent) {
  if (event.mode === null) return { items: 0, lots: 0 };
  const mystery = event.mode === 'MYSTERY';
  const { roundId } = event;
  let items = 0;
  let lots = 0;

  for (const entry of event.entries) {
    if (entry.kind === 'ITEM') {
      items += (await tx.item.updateMany({ where: { id: entry.catalogId, roundId }, data: { mystery } })).count;
      continue;
    }
    lots += (await tx.lot.updateMany({ where: { id: entry.catalogId }, data: { mystery } })).count;
    items += (await tx.item.updateMany({ where: { lotId: entry.catalogId, roundId }, data: { mystery } })).count;
  }
  return { items, lots, mystery };
}
