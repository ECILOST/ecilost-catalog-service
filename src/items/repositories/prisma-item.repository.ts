import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Item } from '../entities/item.entity.js';
import {
  ItemVersionConflictError,
  type ItemFilter,
  type ItemRepository,
  type RegisterItemInput,
  type UpdateItemInput,
} from '../ports/item.repository.js';

@Injectable()
export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: RegisterItemInput): Promise<Item> {
    return this.prisma.item.create({
      data: {
        name: input.name,
        description: input.description,
        condition: input.condition,
        category: input.category,
        registeredBy: input.registeredBy,
        // Quien registra es quien modifico por ultima vez, hasta que alguien lo edite.
        lastModifiedBy: input.registeredBy,
        // `status` y `version` los pone el esquema: AVAILABLE y 0.
      },
    });
  }

  findById(id: string): Promise<Item | null> {
    return this.prisma.item.findUnique({ where: { id } });
  }

  findAll(filter: ItemFilter): Promise<Item[]> {
    return this.prisma.item.findMany({
      where: {
        status: filter.status,
        category: filter.category,
      },
      orderBy: { registeredAt: 'desc' },
      take: filter.limit,
      skip: filter.offset,
    });
  }

  async update({
    id,
    expectedVersion,
    patch,
    lastModifiedBy,
  }: UpdateItemInput): Promise<Item> {
    try {
      // Una sola sentencia: la version viaja en el WHERE, asi que la base arbitra. Leerla,
      // decidir en Node y escribir despues dejaria una ventana en la que dos funcionarios
      // pasan los dos y el segundo pisa al primero.
      return await this.prisma.item.update({
        where: { id, version: expectedVersion },
        data: { ...patch, lastModifiedBy, version: { increment: 1 } },
      });
    } catch (error) {
      // P2025 es "no encontro fila que actualizar": o el id no existe, o la version ya
      // avanzo. Para el cliente son el mismo caso, releer y reintentar.
      if (isRecordNotFound(error)) throw new ItemVersionConflictError(id);
      throw error;
    }
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    // Las tres condiciones van en el WHERE junto a la version. Comprobar antes que el
    // objeto este libre y borrar despues permitiria que entrara a una ronda justo en medio.
    const { count } = await this.prisma.item.deleteMany({
      where: {
        id,
        version: expectedVersion,
        lotId: null,
        roundId: null,
        status: { notIn: ['SOLD'] },
      },
    });
    return count > 0;
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2025'
  );
}
