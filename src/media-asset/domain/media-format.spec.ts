import { describe, expect, it } from 'vitest';
import {
  executable,
  jpeg,
  mp4,
  pdf,
  png,
  JPEG_HEADER,
} from '../../../test/helpers/media-fixtures.js';
import { detectFormat, SUPPORTED_LABELS } from './media-format.js';

describe('detectFormat', () => {
  it('reconoce una fotografia JPEG', () => {
    expect(detectFormat(jpeg())).toMatchObject({
      kind: 'PHOTO',
      contentType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('reconoce una fotografia PNG', () => {
    expect(detectFormat(png())).toMatchObject({
      kind: 'PHOTO',
      contentType: 'image/png',
    });
  });

  it('reconoce un WebP por la marca que va tras el tamano del contenedor', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      // Los cuatro bytes de tamano cambian en cada archivo y no deben participar.
      Buffer.from([0x24, 0x10, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(64),
    ]);

    expect(detectFormat(webp)).toMatchObject({
      kind: 'PHOTO',
      contentType: 'image/webp',
    });
  });

  it('reconoce un video MP4', () => {
    expect(detectFormat(mp4())).toMatchObject({
      kind: 'VIDEO',
      contentType: 'video/mp4',
    });
  });

  it('reconoce un video WebM', () => {
    const webm = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.alloc(64),
    ]);

    expect(detectFormat(webm)).toMatchObject({
      kind: 'VIDEO',
      contentType: 'video/webm',
    });
  });

  it('rechaza un PDF, que es valido pero no documenta el estado de un objeto', () => {
    expect(detectFormat(pdf())).toBeNull();
  });

  it('rechaza un ejecutable aunque llegue con nombre de fotografia', () => {
    // Es el caso que justifica mirar los bytes: la extension y el Content-Type los escribe
    // quien sube el archivo, asi que renombrarlo bastaria para colarlo.
    expect(detectFormat(executable())).toBeNull();
  });

  it('rechaza un archivo mas corto que cualquier cabecera conocida', () => {
    expect(detectFormat(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('rechaza un archivo vacio', () => {
    expect(detectFormat(Buffer.alloc(0))).toBeNull();
  });

  it('no se deja enganar por la cabecera correcta en la posicion equivocada', () => {
    const desplazado = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from(JPEG_HEADER),
    ]);

    expect(detectFormat(desplazado)).toBeNull();
  });

  it('publica los formatos admitidos, que es lo que el rechazo debe enumerar', () => {
    expect(SUPPORTED_LABELS).toEqual(['JPEG', 'PNG', 'WebP', 'MP4', 'WebM']);
  });
});
