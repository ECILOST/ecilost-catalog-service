import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProblemException } from '../common/http/problem.exception.js';
import { type Lot } from './entities/lot.entity.js';

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * HU-05/HU-06. La creacion y la reserva de cada objeto forman una transaccion unica.
   * `updateMany` condiciona cada fila a AVAILABLE y lotId nulo: PostgreSQL toma el
   * bloqueo de escritura y, si otra solicitud gano antes, esta falla sin dejar un lote
   * parcial ni duplicar un objeto en dos lotes activos.
   */
  async create(name: string, itemIds: string[], createdBy: string): Promise<Lot> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
        if (existing.length !== itemIds.length) {
          throw new NotFoundException('Uno o mas objetos no existen.');
        }

        const lot = await tx.lot.create({ data: { name, createdBy: createdBy } });
        const assigned = await tx.item.updateMany({
          where: { id: { in: itemIds }, status: 'AVAILABLE', lotId: null, roundId: null },
          data: { status: 'IN_LOT', lotId: lot.id, version: { increment: 1 }, lastModifiedBy: createdBy },
        });

        if (assigned.count !== itemIds.length) {
          throw new LotExclusivityError();
        }

        return tx.lot.findUniqueOrThrow({
          where: { id: lot.id },
          include: { items: { orderBy: { registeredAt: 'asc' } } },
        });
      });
    } catch (error) {
      if (error instanceof LotExclusivityError || error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  findAll(): Promise<Lot[]> {
    return this.prisma.lot.findMany({ include: { items: { orderBy: { registeredAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Lot> {
    const lot = await this.prisma.lot.findUnique({ where: { id }, include: { items: { orderBy: { registeredAt: 'asc' } } } });
    if (!lot) throw new NotFoundException(`No existe el lote ${id}.`);
    return lot;
  }

  /** Punto de integracion para la futura sala de subastas; no expone un endpoint nuevo. */
  async releaseItems(lotId: string, status: 'CLOSED' | 'CANCELLED'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.lot.updateMany({ where: { id: lotId, status: 'ACTIVE' }, data: { status } });
      if (!changed.count) throw new LotExclusivityError('El lote no esta activo o no existe.');
      await tx.item.updateMany({ where: { lotId, status: 'IN_LOT' }, data: { lotId: null, status: 'AVAILABLE', version: { increment: 1 } } });
    });
  }
}

export class LotExclusivityError extends ProblemException {
  constructor(detail = 'Uno o mas objetos ya no estan disponibles o pertenecen a otro lote activo.') {
    super(HttpStatus.CONFLICT, 'https://ecilost.dev/problems/objeto-en-lote', 'Objeto ya asignado a un lote', detail);
  }
}
