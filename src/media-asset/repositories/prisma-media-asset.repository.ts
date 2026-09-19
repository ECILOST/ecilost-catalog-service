import { Injectable } from '@nestjs/common';
import { MediaKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaAsset } from '../entities/media-asset.entity.js';
import {
  MediaOwnerNotFoundError,
  VideoAlreadyExistsError,
  type AttachMediaInput,
  type MediaAssetRepository,
} from '../ports/media-asset.repository.js';

@Injectable()
export class PrismaMediaAssetRepository implements MediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async attach(input: AttachMediaInput): Promise<MediaAsset> {
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          id: input.id,
          itemId: input.itemId,
          kind: input.kind,
          storageKey: input.storageKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          position: input.position,
          uploadedBy: input.uploadedBy,
          // El truco de la restriccion unica: el video ocupa la ranura del objeto y la
          // foto la deja nula. Se decide aqui porque es un detalle del esquema, no del
          // caso de uso. Ver el comentario de `videoSlot` en prisma/schema.prisma.
          videoSlot: input.kind === MediaKind.VIDEO ? input.itemId : null,
        },
      });
    } catch (error) {
      // Las dos condiciones las arbitra la base, no una consulta previa: asi dos subidas
      // simultaneas del segundo video no pueden pasar las dos.
      if (isUniqueViolation(error))
        throw new VideoAlreadyExistsError(input.itemId);
      if (isForeignKeyViolation(error))
        throw new MediaOwnerNotFoundError(input.itemId);
      throw error;
    }
  }

  findByItem(itemId: string): Promise<MediaAsset[]> {
    return this.prisma.mediaAsset.findMany({
      where: { itemId },
      // El video sale primero por el orden del enum, pero la ficha lo reparte igual: este
      // orden solo garantiza que la galeria de fotos salga estable entre peticiones.
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
  }

  async findCovers(itemIds: string[]): Promise<Map<string, MediaAsset>> {
    // Sin identificadores no hay nada que preguntar, y un `IN ()` vacio es una consulta
    // que siempre devuelve nada: mejor no hacerla.
    if (itemIds.length === 0) return new Map();

    const covers = await this.prisma.mediaAsset.findMany({
      where: { itemId: { in: itemIds }, kind: MediaKind.PHOTO },
      // `distinct` sobre este orden deja la fotografia de menor posicion de cada objeto, en
      // una sola consulta. Filtrar por `position: 0` seria mas corto y estaria mal: retirar
      // una fotografia no renumera las demas, asi que la cero puede no existir.
      orderBy: [{ itemId: 'asc' }, { position: 'asc' }],
      distinct: ['itemId'],
    });

    return new Map(covers.map((cover) => [cover.itemId, cover]));
  }

  countPhotos(itemId: string): Promise<number> {
    return this.prisma.mediaAsset.count({
      where: { itemId, kind: MediaKind.PHOTO },
    });
  }

  async detach(itemId: string, id: string): Promise<MediaAsset | null> {
    try {
      // Una sola sentencia con las dos condiciones. Comprobar antes de quien es la pieza
      // y borrar despues permitiria borrar multimedia de otra ficha.
      return await this.prisma.mediaAsset.delete({ where: { id, itemId } });
    } catch (error) {
      // P2025 es "no encontro fila que borrar": o el id no existe, o cuelga de otro
      // objeto. Para el cliente son el mismo caso.
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === code
  );
}

const isUniqueViolation = (error: unknown): boolean => hasCode(error, 'P2002');
const isForeignKeyViolation = (error: unknown): boolean =>
  hasCode(error, 'P2003');
const isRecordNotFound = (error: unknown): boolean => hasCode(error, 'P2025');
