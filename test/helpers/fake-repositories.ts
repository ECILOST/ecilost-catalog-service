import { randomUUID } from 'node:crypto';
import type { Item } from '../../src/items/entities/item.entity.js';
import {
  ItemVersionConflictError,
  type ItemFilter,
  type ItemRepository,
  type RegisterItemInput,
  type UpdateItemInput,
} from '../../src/items/ports/item.repository.js';

/**
 * Doble en memoria del puerto de salida. Existe para que las pruebas del caso de uso corran
 * sin Postgres; la integracion de verdad usa PrismaItemRepository.
 *
 * Reproduce la semantica de version del adaptador real: una escritura con version vieja
 * falla, y una aceptada incrementa la version.
 */
export class FakeItemRepository implements ItemRepository {
  readonly rows = new Map<string, Item>();

  async create(input: RegisterItemInput): Promise<Item> {
    const now = new Date();
    const created: Item = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      condition: input.condition,
      category: input.category,
      status: 'AVAILABLE',
      lotId: null,
      roundId: null,
      version: 0,
      registeredBy: input.registeredBy,
      registeredAt: now,
      lastModifiedBy: input.registeredBy,
      lastModifiedAt: now,
    };
    this.rows.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<Item | null> {
    return this.rows.get(id) ?? null;
  }

  async findAll(filter: ItemFilter): Promise<Item[]> {
    return [...this.rows.values()]
      .filter((i) => (filter.status ? i.status === filter.status : true))
      .filter((i) => (filter.category ? i.category === filter.category : true))
      .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime())
      .slice(filter.offset, filter.offset + filter.limit);
  }

  async update({
    id,
    expectedVersion,
    patch,
    lastModifiedBy,
  }: UpdateItemInput): Promise<Item> {
    const current = this.rows.get(id);
    if (!current || current.version !== expectedVersion) {
      throw new ItemVersionConflictError(id);
    }

    const updated: Item = {
      ...current,
      ...patch,
      version: current.version + 1,
      lastModifiedBy,
      lastModifiedAt: new Date(),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    const current = this.rows.get(id);
    const free =
      current !== undefined &&
      current.version === expectedVersion &&
      current.lotId === null &&
      current.roundId === null &&
      current.status !== 'SOLD';

    if (!free) return false;
    this.rows.delete(id);
    return true;
  }

  /** Atajo de prueba: siembra un objeto ya existente con el estado que haga falta. */
  seed(overrides: Partial<Item> = {}): Item {
    const now = new Date();
    const item: Item = {
      id: randomUUID(),
      name: 'Portatil Lenovo ThinkPad',
      description: 'Carcasa negra con una calcomania de la universidad.',
      condition: 'GOOD',
      category: 'Electronica',
      status: 'AVAILABLE',
      lotId: null,
      roundId: null,
      version: 0,
      registeredBy: 'funcionario-1',
      registeredAt: now,
      lastModifiedBy: 'funcionario-1',
      lastModifiedAt: now,
      ...overrides,
    };
    this.rows.set(item.id, item);
    return item;
  }
}
