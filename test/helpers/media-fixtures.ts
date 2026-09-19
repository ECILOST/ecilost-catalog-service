/**
 * Archivos de prueba con cabeceras reales.
 *
 * Son los bytes que de verdad identifican a cada formato, no ficheros de ejemplo metidos
 * en el repositorio. El relleno posterior es irrelevante: el servicio reconoce el tipo por
 * la cabecera, asi que una prueba con la cabecera correcta ejercita exactamente el mismo
 * camino que un JPEG de dos megabytes.
 */

/** Rellena hasta `size` para simular un archivo de ese peso. */
function withSize(header: number[] | Buffer, size: number): Buffer {
  const head = Buffer.from(header);
  if (size <= head.length) return head;
  return Buffer.concat([head, Buffer.alloc(size - head.length, 0x20)]);
}

export const JPEG_HEADER = [
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
];
export const PNG_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
];

/** Caja `ftyp` de ISO base media, que es como empieza cualquier mp4. */
export const MP4_HEADER = [
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
];

export const jpeg = (size = 2048): Buffer => withSize(JPEG_HEADER, size);
export const png = (size = 2048): Buffer => withSize(PNG_HEADER, size);
export const mp4 = (size = 8192): Buffer => withSize(MP4_HEADER, size);

/** Un PDF: formato perfectamente valido, pero no de los que documentan un objeto perdido. */
export const pdf = (size = 1024): Buffer =>
  withSize(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3', 'binary'), size);

/** Un ejecutable de Windows renombrado. El caso que la extension sola no atraparia. */
export const executable = (size = 1024): Buffer =>
  withSize(
    Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00', 'binary'),
    size,
  );
