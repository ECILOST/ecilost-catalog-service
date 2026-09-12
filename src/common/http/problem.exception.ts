import { HttpException } from '@nestjs/common';

/**
 * Excepcion que fija su propio `type` y `title` de Problem Details.
 *
 * ProblemDetailsFilter deduce el tipo del codigo de estado, lo que basta casi siempre. Se
 * queda corto cuando un mismo codigo cubre problemas distintos: dos peticiones responden
 * 409, una porque la version quedo vieja y otra porque el estado pedido no se puede
 * escribir a mano, y el cliente tiene que poder distinguirlas sin leer prosa.
 */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly type: string,
    readonly title: string,
    detail: string,
  ) {
    super({ type, title, status, detail }, status);
  }
}
