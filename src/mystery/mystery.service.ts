import { Injectable } from '@nestjs/common';
import type { ItemCondition } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Lo que el estudiante puede saber de una entrada misteriosa: nada que la delate. */
export type MysteryEntry =
  | { kind: 'ITEM'; category: string; condition: ItemCondition; clues: string[] }
  | { kind: 'LOT'; itemCount: number; categories: string[]; clues: string[] };

/**
 * Pistas del lote misterioso (ADR-0002). Para una ronda oculta se entrega la categoria, la
 * condicion y las pistas que escribio el funcionario; nunca el nombre, la descripcion, las
 * fotos ni el identificador, que es justo lo que la ronda esconde.
 */
@Injectable()
export class MysteryService {
  constructor(private readonly prisma: PrismaService) {}

  async cluesForRound(roundId: string): Promise<{ roundId: string; entries: MysteryEntry[] }> {
    const items = await this.prisma.item.findMany({
      where: { roundId, mystery: true },
      orderBy: { registeredAt: 'asc' },
      select: { lotId: true, category: true, condition: true, clues: true },
    });

    const entries: MysteryEntry[] = [];
    const lots = new Map<string, typeof items>();
    for (const item of items) {
      if (item.lotId) lots.set(item.lotId, [...(lots.get(item.lotId) ?? []), item]);
      else entries.push({ kind: 'ITEM', category: item.category, condition: item.condition, clues: item.clues });
    }
    for (const lotItems of lots.values()) {
      entries.push({
        kind: 'LOT',
        itemCount: lotItems.length,
        categories: [...new Set(lotItems.map((item) => item.category))],
        clues: [...new Set(lotItems.flatMap((item) => item.clues))],
      });
    }
    return { roundId, entries };
  }
}
