import type { ItemCondition, ItemStatus } from '../../generated/prisma/enums.js';
import type { Item } from '../entities/item.entity.js';

export interface RegisterItemInput {
  name: string;
  description: string;
  condition: ItemCondition;
  category: string;
  /** userId del funcionario que lo registra, tomado del access token. */
  registeredBy: string;
}

/** Cambio parcial del objeto. Un campo ausente no se toca. */
export interface ItemPatch {
  name?: string;
  description?: string;
  condition?: ItemCondition;
  category?: string;
  status?: ItemStatus;
}

export interface UpdateItemInput {
  id: string;
  /** Version que el cliente cree vigente. Si no coincide, la escritura se rechaza. */
  expectedVersion: number;
  patch: ItemPatch;
  lastModifiedBy: string;
}

export interface ItemFilter {
  status?: ItemStatus;
  category?: string;
  limit: number;
  offset: number;
}

/** Se lanza cuando la version esperada ya no es la vigente. El controlador lo vuelve 409. */
export class ItemVersionConflictError extends Error {
  constructor(readonly id: string) {
    super('El objeto fue modificado por otra persona. Vuelve a cargarlo e intenta de nuevo.');
    this.name = 'ItemVersionConflictError';
  }
}

/**
 * Puerto de salida hacia el almacen del catalogo. Existe para que el caso de uso se pueda
 * probar con un doble y sin Postgres levantado, no para anticipar otro motor.
 */
export interface ItemRepository {
  create(input: RegisterItemInput): Promise<Item>;

  findById(id: string): Promise<Item | null>;

  findAll(filter: ItemFilter): Promise<Item[]>;

  /**
   * Aplica el cambio solo si la fila sigue en `expectedVersion`, e incrementa la version.
   * Debe ser una sola sentencia condicional: leer la version, decidir y escribir despues
   * deja una ventana en la que dos funcionarios pasan los dos y uno pisa al otro.
   *
   * Lanza ItemVersionConflictError cuando no encuentra fila que actualizar.
   */
  update(input: UpdateItemInput): Promise<Item>;

  /**
   * Borra el objeto solo si sigue en `expectedVersion` y libre de lote y de ronda.
   * Devuelve false si no borro nada. La condicion viaja en el WHERE a proposito: si se
   * comprueba antes y se borra despues, el objeto puede entrar a una ronda justo en medio.
   */
  delete(id: string, expectedVersion: number): Promise<boolean>;
}

export const ITEM_REPOSITORY = Symbol('ItemRepository');
