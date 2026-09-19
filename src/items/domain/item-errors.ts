import type { DeletionBlocker } from '../entities/item.entity.js';

/**
 * Errores de dominio del catalogo. El servicio los lanza y el controlador los traduce a
 * un codigo HTTP: aqui no se conoce el transporte.
 */

export class ItemNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`No existe un objeto con identificador ${id}.`);
    this.name = 'ItemNotFoundError';
  }
}

/** HU-04: el funcionario intento escribir a mano un estado que no le corresponde mover. */
export class InvalidStatusTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`No se puede pasar de ${from} a ${to} desde la edicion del catalogo.`);
    this.name = 'InvalidStatusTransitionError';
  }
}

/**
 * HU-04: se intento borrar un objeto comprometido. Lleva el bloqueo dentro para que el
 * controlador pueda decir cual ronda lo retiene, que es lo que exige el criterio.
 */
export class ItemInUseError extends Error {
  constructor(readonly blocker: DeletionBlocker) {
    super(describeBlocker(blocker));
    this.name = 'ItemInUseError';
  }
}

function describeBlocker(blocker: DeletionBlocker): string {
  switch (blocker.reason) {
    case 'IN_ROUND':
      return `No se puede borrar: el objeto esta comprometido en la ronda ${blocker.roundId}.`;
    case 'IN_LOT':
      return `No se puede borrar: el objeto pertenece al lote ${blocker.lotId}.`;
    case 'SOLD':
      return 'No se puede borrar: el objeto ya fue vendido y su historial debe conservarse.';
  }
}
