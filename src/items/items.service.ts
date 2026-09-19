import { Inject, Injectable, Logger } from '@nestjs/common';
import { canStaffTransition, deletionBlocker, type Item } from './entities/item.entity.js';
import {
  InvalidStatusTransitionError,
  ItemInUseError,
  ItemNotFoundError,
} from './domain/item-errors.js';
import {
  ITEM_REPOSITORY,
  ItemVersionConflictError,
  type ItemFilter,
  type ItemRepository,
  type RegisterItemInput,
  type UpdateItemInput,
} from './ports/item.repository.js';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(@Inject(ITEM_REPOSITORY) private readonly items: ItemRepository) {}

  /**
   * HU-03: da de alta un objeto perdido.
   *
   * El estado inicial no se acepta desde fuera. El criterio dice que nace Disponible, y
   * dejar que el cliente lo escriba permitiria registrar algo ya marcado como vendido.
   *
   * Las fotografias tampoco entran aqui: son de la HU-07 y se adjuntan despues contra el
   * objeto ya creado. Registrar y subir archivos son operaciones distintas.
   */
  async register(input: RegisterItemInput): Promise<Item> {
    const item = await this.items.create(input);
    this.logger.log(`Objeto registrado: ${item.id} por ${input.registeredBy}`);
    return item;
  }

  /** HU-03, criterio 3: el objeto recien registrado aparece en el catalogo. */
  findAll(filter: ItemFilter): Promise<Item[]> {
    return this.items.findAll(filter);
  }

  findById(id: string): Promise<Item> {
    return this.requireById(id);
  }

  /**
   * HU-04: edita el objeto si nadie lo cambio desde que el funcionario lo leyo.
   *
   * La escritura la arbitra la base con la version en el WHERE. Aqui solo se decide que
   * transiciones de estado puede hacer una persona a mano y como se llama cada fallo.
   */
  async update(input: UpdateItemInput): Promise<Item> {
    // Validar la transicion exige conocer el estado actual, asi que hay una lectura previa.
    // No abre una ventana de carrera: si alguien cambia el objeto entre esta lectura y la
    // escritura, cambia tambien su version, y el UPDATE condicional no encuentra fila. La
    // lectura decide el mensaje de error; la version decide quien gana.
    if (input.patch.status !== undefined) {
      const current = await this.requireById(input.id);
      if (!canStaffTransition(current.status, input.patch.status)) {
        throw new InvalidStatusTransitionError(current.status, input.patch.status);
      }
    }

    try {
      const updated = await this.items.update(input);
      this.logger.log(
        `Objeto ${updated.id} editado por ${input.lastModifiedBy}, version ${updated.version}`,
      );
      return updated;
    } catch (error) {
      // El adaptador no distingue "no existe" de "version vieja": las dos son cero filas
      // afectadas. La diferencia si le importa al cliente, asi que se resuelve aqui, y
      // solo en la rama de error.
      if (error instanceof ItemVersionConflictError) await this.requireById(input.id);
      throw error;
    }
  }

  /**
   * HU-04: borra un objeto que no este comprometido.
   *
   * Hay dos lecturas alrededor de la escritura y no son el antipatron de comprobar antes
   * de actuar: la garantia vive en el WHERE del DELETE, que exige version, lote nulo y
   * ronda nula. Las lecturas solo eligen que mensaje de error dar.
   */
  async remove(id: string, expectedVersion: number): Promise<void> {
    // Lectura previa: sirve para decir QUE lo bloquea, que es lo que pide el criterio.
    const item = await this.requireById(id);
    const blocker = deletionBlocker(item);
    if (blocker) throw new ItemInUseError(blocker);

    const deleted = await this.items.delete(id, expectedVersion);
    if (deleted) {
      this.logger.log(`Objeto ${id} borrado`);
      return;
    }

    // Cero filas borradas. O la version cambio, o el objeto entro a una ronda justo entre
    // la lectura de arriba y este borrado. Esa ventana existe y no se cierra leyendo mas
    // rapido: se cierra porque las condiciones viajan en el WHERE. Se relee solo para
    // decidir cual de los dos motivos reportar.
    const current = await this.requireById(id);
    const late = deletionBlocker(current);
    if (late) throw new ItemInUseError(late);
    throw new ItemVersionConflictError(id);
  }

  private async requireById(id: string): Promise<Item> {
    const item = await this.items.findById(id);
    if (!item) throw new ItemNotFoundError(id);
    return item;
  }
}
