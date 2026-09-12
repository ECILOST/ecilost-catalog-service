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
