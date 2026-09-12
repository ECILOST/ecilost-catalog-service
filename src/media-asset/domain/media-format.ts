import { MediaKind } from '../../generated/prisma/enums.js';

/**
 * Formato multimedia admitido: como se reconoce, como se guarda y como se nombra.
 *
 * El reconocimiento es por los primeros bytes del archivo y NO por la extension ni por el
 * `Content-Type` de la peticion. Los dos los escribe el cliente, asi que renombrar un
 * ejecutable a `.jpg` bastaria para colarlo. Los bytes de cabecera los pone el codificador
 * que produjo el archivo.
 */
export interface MediaFormat {
  kind: MediaKind;
  /** Content type con el que se guarda y se sirve, ya normalizado. */
  contentType: string;
  extension: string;
  /** Nombre para el mensaje de rechazo. El criterio exige decir que si se admite. */
  label: string;
}

interface Signature extends MediaFormat {
  matches(head: Buffer): boolean;
}

/** Bytes que hay que leer para reconocer cualquiera de los formatos de abajo. */
export const SIGNATURE_LENGTH = 12;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const ascii = (head: Buffer, from: number, to: number): string =>
  head.subarray(from, to).toString('ascii');

const SIGNATURES: readonly Signature[] = [
  {
    kind: MediaKind.PHOTO,
    contentType: 'image/jpeg',
    extension: 'jpg',
    label: 'JPEG',
    matches: (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  },
  {
    kind: MediaKind.PHOTO,
    contentType: 'image/png',
    extension: 'png',
    label: 'PNG',
    matches: (head) => head.subarray(0, 8).equals(PNG_MAGIC),
  },
  {
    // Contenedor RIFF con la marca WEBP en el cuarto campo. Los cuatro bytes intermedios
    // son el tamano del archivo y varian, por eso se saltan.
    kind: MediaKind.PHOTO,
    contentType: 'image/webp',
    extension: 'webp',
    label: 'WebP',
    matches: (head) =>
      ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP',
  },
  {
    // ISO base media: los cuatro primeros bytes son el tamano de la caja y el tipo va
    // despues. Cubre mp4, m4v y los mov que exporta un telefono.
    kind: MediaKind.VIDEO,
    contentType: 'video/mp4',
    extension: 'mp4',
    label: 'MP4',
    matches: (head) => ascii(head, 4, 8) === 'ftyp',
  },
  {
    kind: MediaKind.VIDEO,
    contentType: 'video/webm',
    extension: 'webm',
    label: 'WebM',
    matches: (head) => head.subarray(0, 4).equals(WEBM_MAGIC),
  },
];

/** Lo que se le dice al funcionario cuando su archivo no es ninguno de los admitidos. */
export const SUPPORTED_LABELS: readonly string[] = SIGNATURES.map(
  (s) => s.label,
);

/**
 * Reconoce el formato por la cabecera del archivo. Devuelve null si no es ninguno de los
 * admitidos, que es lo que el criterio 2 de la HU-07 manda rechazar.
 */
export function detectFormat(content: Buffer): MediaFormat | null {
  if (content.length < SIGNATURE_LENGTH) return null;

  const head = content.subarray(0, SIGNATURE_LENGTH);
  const found = SIGNATURES.find((signature) => signature.matches(head));
  if (!found) return null;

  const { kind, contentType, extension, label } = found;
  return { kind, contentType, extension, label };
}
