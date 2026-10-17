import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MediaKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  MediaTooLargeError,
  UnsupportedMediaFormatError,
} from '../../media-asset/domain/media-errors.js';
import { detectFormat } from '../../media-asset/domain/media-format.js';
import {
  MAX_PHOTO_BYTES,
  READ_URL_TTL_SECONDS,
} from '../../media-asset/domain/media-policy.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
} from '../../media-asset/ports/media-storage.js';

/** Cuantas fotografias admite un lote. Una galeria corta: el detalle esta en cada objeto. */
export const MAX_PHOTOS_PER_LOT = 6;

export interface LotPhoto {
  id: string;
  lotId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  position: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export type SignedLotPhoto = LotPhoto & { url: string };

export interface AttachLotPhotoCommand {
  lotId: string;
  uploadedBy: string;
  file: { content: Buffer; sizeBytes: number };
}

/** Un lote solo lleva fotografias: un video se rechaza aunque sea de un formato valido. */
export class LotVideoNotAllowedError extends Error {
  constructor() {
    super('Los lotes solo admiten fotografias JPEG, PNG o WebP.');
    this.name = 'LotVideoNotAllowedError';
  }
}

export class LotPhotoLimitReachedError extends Error {
  constructor(readonly lotId: string) {
    super(
      `El lote ya tiene ${MAX_PHOTOS_PER_LOT} fotografias, que es el maximo. ` +
        'Borra alguna antes de subir otra.',
    );
    this.name = 'LotPhotoLimitReachedError';
  }
}

export class LotNotFoundError extends Error {
  constructor(readonly lotId: string) {
    super(`No existe el lote ${lotId}.`);
    this.name = 'LotNotFoundError';
  }
}

/** Cubre "no existe" y "es de otro lote": distinguirlos dejaria sondear lotes ajenos. */
export class LotPhotoNotFoundError extends Error {
  constructor(
    readonly lotId: string,
    readonly photoId: string,
  ) {
    super(
      `El lote ${lotId} no tiene una fotografia con identificador ${photoId}.`,
    );
    this.name = 'LotPhotoNotFoundError';
  }
}

/**
 * Fotografias de un lote: su portada en el catalogo y en la sala de subastas.
 *
 * Sigue las mismas reglas que la multimedia de un objeto (HU-07): el tipo se reconoce por los
 * bytes y no por la extension, el archivo se escribe antes que la fila y se retira si la fila
 * no entra, y la URL de lectura se firma al responder, nunca se guarda.
 */
@Injectable()
export class LotPhotoService {
  private readonly logger = new Logger(LotPhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  async attach(command: AttachLotPhotoCommand): Promise<SignedLotPhoto> {
    const format = detectFormat(command.file.content);
    if (!format) throw new UnsupportedMediaFormatError();
    if (format.kind !== MediaKind.PHOTO) throw new LotVideoNotAllowedError();
    if (command.file.sizeBytes > MAX_PHOTO_BYTES) {
      throw new MediaTooLargeError(format.kind, command.file.sizeBytes);
    }

    const lot = await this.prisma.lot.findUnique({
      where: { id: command.lotId },
      select: { id: true, _count: { select: { photos: true } } },
    });
    if (!lot) throw new LotNotFoundError(command.lotId);
    // Cota blanda, como en los objetos: dos subidas simultaneas pueden dejar una de mas.
    if (lot._count.photos >= MAX_PHOTOS_PER_LOT) {
      throw new LotPhotoLimitReachedError(command.lotId);
    }

    const id = randomUUID();
    const storageKey = `lots/${command.lotId}/${id}.${format.extension}`;
    await this.storage.put(
      storageKey,
      command.file.content,
      format.contentType,
    );

    try {
      const photo = await this.prisma.lotPhoto.create({
        data: {
          id,
          lotId: command.lotId,
          storageKey,
          contentType: format.contentType,
          sizeBytes: command.file.sizeBytes,
          position: lot._count.photos,
          uploadedBy: command.uploadedBy,
        },
      });
      this.logger.log(
        `Fotografia ${id} adjuntada al lote ${command.lotId} por ${command.uploadedBy}`,
      );
      return this.sign(photo);
    } catch (error) {
      // La fila no entro (el lote desaparecio entre medias): el archivo queda sin dueno.
      await this.discard(storageKey);
      throw error;
    }
  }

  async remove(lotId: string, photoId: string): Promise<void> {
    // La pertenencia va en la misma sentencia: un id de otro lote no borra nada ajeno.
    const photo = await this.prisma.lotPhoto.findFirst({
      where: { id: photoId, lotId },
    });
    if (!photo) throw new LotPhotoNotFoundError(lotId, photoId);
    await this.prisma.lotPhoto.delete({ where: { id: photo.id } });
    // Primero sale del lote y despues del almacen: al reves habria un instante con la
    // imagen rota delante de quien mira.
    await this.discard(photo.storageKey);
    this.logger.log(`Fotografia ${photoId} retirada del lote ${lotId}`);
  }

  /** La galeria de un lote, en orden y ya firmada. */
  async findByLot(lotId: string): Promise<SignedLotPhoto[]> {
    const photos = await this.prisma.lotPhoto.findMany({
      where: { lotId },
      orderBy: [{ position: 'asc' }, { uploadedAt: 'asc' }],
    });
    return Promise.all(photos.map((photo) => this.sign(photo)));
  }

  /**
   * La portada de cada lote (su primera fotografia), firmada, en una sola consulta para todo
   * el listado. Los lotes sin fotografia no estan en el mapa.
   */
  async findCovers(lotIds: string[]): Promise<Map<string, string>> {
    if (lotIds.length === 0) return new Map();
    const photos = await this.prisma.lotPhoto.findMany({
      where: { lotId: { in: lotIds } },
      orderBy: [{ position: 'asc' }, { uploadedAt: 'asc' }],
    });
    const first = new Map<string, LotPhoto>();
    for (const photo of photos)
      if (!first.has(photo.lotId)) first.set(photo.lotId, photo);

    const signed = await Promise.all(
      [...first].map(
        async ([lotId, photo]) =>
          [
            lotId,
            await this.storage.signedReadUrl(
              photo.storageKey,
              READ_URL_TTL_SECONDS,
            ),
          ] as const,
      ),
    );
    return new Map(signed);
  }

  private async sign(photo: LotPhoto): Promise<SignedLotPhoto> {
    return {
      ...photo,
      url: await this.storage.signedReadUrl(
        photo.storageKey,
        READ_URL_TTL_SECONDS,
      ),
    };
  }

  /** Retira un archivo sin dejar que el fallo tumbe la operacion: queda, como mucho, huerfano. */
  private async discard(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      this.logger.error(
        `Quedo huerfano ${storageKey} en el almacen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
