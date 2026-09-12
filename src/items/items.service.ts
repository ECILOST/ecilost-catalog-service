import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Item } from './entities/item.entity.js';
import { ItemNotFoundError } from './domain/item-errors.js';
import {
  ITEM_REPOSITORY,
  type ItemFilter,
  type ItemRepository,
  type RegisterItemInput,
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

  async findById(id: string): Promise<Item> {
    const item = await this.items.findById(id);
    if (!item) throw new ItemNotFoundError(id);
    return item;
  }
}
