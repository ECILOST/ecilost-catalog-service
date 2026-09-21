import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MediaKind } from '../generated/prisma/enums.js';
import {
  MediaAssetNotFoundError,
  MediaTooLargeError,
  PhotoLimitReachedError,
  UnsupportedMediaFormatError,
} from './domain/media-errors.js';
import { detectFormat, type MediaFormat } from './domain/media-format.js';
import {
  MAX_PHOTOS_PER_ITEM,
  READ_URL_TTL_SECONDS,
  maxBytesFor,
} from './domain/media-policy.js';
import {
  splitByKind,
  type ItemMedia,
  type MediaAsset,
  type SignedMediaAsset,
} from './entities/media-asset.entity.js';
import {
  MEDIA_ASSET_REPOSITORY,
  type MediaAssetRepository,
} from './ports/media-asset.repository.js';
import { MEDIA_STORAGE, type MediaStorage } from './ports/media-storage.js';

/** El archivo tal como llega del formulario. */
export interface UploadedContent {
  content: Buffer;
  sizeBytes: number;
}

export interface AttachMediaCommand {
  itemId: string;
  /** userId del funcionario, tomado del access token. */
  uploadedBy: string;
  file: UploadedContent;
}

@Injectable()
export class MediaAssetService {
  private readonly logger = new Logger(MediaAssetService.name);

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY)
    private readonly assets: MediaAssetRepository,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * HU-07, criterios 1 y 2: adjunta una fotografia o el video al objeto.
   *
   * El orden de los pasos es la parte que importa. Primero se rechaza todo lo que se puede
   * rechazar sin escribir nada, que es lo que hace cierto el criterio 2: un archivo de tipo
   * no soportado no deja rastro ni en el almacen ni en la base. Solo despues se escriben
   * los bytes, y la fila va al final porque es la que tiene las restricciones.
   *
   * Se escribe el archivo antes que la fila, y no al reves, para que ningun lector llegue a
   * ver una ficha con una imagen rota. El precio es que una fila rechazada deja un archivo
   * colgado, y eso se compensa retirandolo.
   */
  async attach(command: AttachMediaCommand): Promise<SignedMediaAsset> {
    const format = this.recogniseOrReject(command.file);
    const position = await this.nextPosition(command.itemId, format.kind);

    const id = randomUUID();
    const storageKey = `items/${command.itemId}/${id}.${format.extension}`;

    await this.storage.put(
      storageKey,
      command.file.content,
      format.contentType,
    );

    try {
      const asset = await this.assets.attach({
        id,
        itemId: command.itemId,
        kind: format.kind,
        storageKey,
        contentType: format.contentType,
        sizeBytes: command.file.sizeBytes,
        position,
        uploadedBy: command.uploadedBy,
      });

      this.logger.log(
        `${format.label} adjuntado al objeto ${command.itemId} por ${command.uploadedBy}`,
      );
      return this.sign(asset);
    } catch (error) {
      // La fila no entro: el objeto no existe, o ya tenia video. El archivo que acabamos
      // de escribir se queda sin nada que lo referencie, asi que se retira.
      await this.discard(storageKey);
      throw error;
    }
  }

  /**
   * HU-07, criterio 3: quita una pieza de la ficha sin tocar el resto.
   *
   * La fila se borra primero. Un archivo huerfano en el almacen es basura inofensiva que
   * nadie ve; una fila huerfana es una imagen rota en la ficha del estudiante. Si el
   * borrado del archivo falla, la pieza ya desaparecio de la ficha, que es lo que el
   * criterio promete.
   */
  async remove(itemId: string, mediaId: string): Promise<void> {
    const removed = await this.assets.detach(itemId, mediaId);
    if (!removed) throw new MediaAssetNotFoundError(itemId, mediaId);

    await this.discard(removed.storageKey);
    this.logger.log(`Multimedia ${mediaId} retirada del objeto ${itemId}`);
  }

  /**
   * La multimedia del objeto, con las URL de lectura ya firmadas. Es lo que la ficha
   * entrega al estudiante.
   *
   * Las firmas se calculan en paralelo y no comparten estado, asi que varias fichas
   * pedidas a la vez no se estorban entre si.
   */
  async findByItem(itemId: string): Promise<ItemMedia> {
    const assets = await this.assets.findByItem(itemId);
    const signed = await Promise.all(assets.map((asset) => this.sign(asset)));
    return splitByKind(signed);
  }

  /**
   * La portada de cada objeto del listado: su primera fotografia, ya firmada.
   *
   * El listado no lleva la multimedia entera a proposito, pero sin ninguna imagen una
   * rejilla de objetos perdidos deja de servir para reconocerlos, que es para lo que se
   * mira. Una URL por objeto es el punto medio: una consulta para toda la pagina, y firmar
   * es un HMAC local que ademas va por detras de la cache de firmas.
   *
   * Devuelve un mapa y no un arreglo porque quien lo llama tiene los objetos, no las
   * fotografias: lo que necesita es preguntar por identificador. Los objetos sin fotografia
   * no estan en el mapa, y el listado los publica con la portada en nulo.
   */
  async findCovers(itemIds: string[]): Promise<Map<string, string>> {
    const covers = await this.assets.findCovers(itemIds);

    const signed = await Promise.all(
      [...covers].map(
        async ([itemId, asset]) =>
          [
            itemId,
            await this.storage.signedReadUrl(
              asset.storageKey,
              READ_URL_TTL_SECONDS,
            ),
          ] as const,
      ),
    );

    return new Map(signed);
  }

  /**
   * Reconoce el formato por los bytes y aplica el tope de tamano.
   *
   * No mira la extension ni el `Content-Type` de la peticion: los dos los escribe el
   * cliente, asi que renombrar un archivo bastaria para saltarse la validacion.
   */
  private recogniseOrReject(file: UploadedContent): MediaFormat {
    const format = detectFormat(file.content);
    if (!format) throw new UnsupportedMediaFormatError();

    if (file.sizeBytes > maxBytesFor(format.kind)) {
      throw new MediaTooLargeError(format.kind, file.sizeBytes);
    }
    return format;
  }

  /**
   * Lugar de la foto en la galeria, y de paso el tope de cuantas admite el objeto.
   *
   * Es una cota blanda: dos subidas simultaneas pueden contar lo mismo y dejar once fotos
   * donde el tope son diez. Cerrarlo del todo exigiria una transaccion serializable por
   * cada subida, y el dano de una foto de mas es ninguno. La regla del video si es dura,
   * porque ahi la ficha tendria que elegir cual mostrar, y esa la arbitra la base.
   */
  private async nextPosition(itemId: string, kind: MediaKind): Promise<number> {
    if (kind === MediaKind.VIDEO) return 0;

    const photos = await this.assets.countPhotos(itemId);
    if (photos >= MAX_PHOTOS_PER_ITEM) throw new PhotoLimitReachedError(itemId);
    return photos;
  }

  private async sign(asset: MediaAsset): Promise<SignedMediaAsset> {
    return {
      ...asset,
      url: await this.storage.signedReadUrl(
        asset.storageKey,
        READ_URL_TTL_SECONDS,
      ),
    };
  }

  /**
   * Retira un archivo del almacen sin dejar que el fallo se propague.
   *
   * Se usa en los dos caminos de limpieza, y en ninguno de los dos debe tumbar la
   * operacion: en el borrado la pieza ya salio de la ficha, y en la subida el error que
   * importa es el que provoco la compensacion, no este. Lo que queda es un archivo
   * huerfano, que no se ve desde ninguna ficha.
   */
  private async discard(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      this.logger.error(
        `Quedo huerfano ${storageKey} en el almacen: ${asMessage(error)}`,
      );
    }
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
