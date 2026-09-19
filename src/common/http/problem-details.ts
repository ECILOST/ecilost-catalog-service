/**
 * Cuerpo de error del servicio, segun RFC 9457 (Problem Details).
 *
 * Un `400` con `{"message": "bad request"}` obliga al consumidor a adivinar si reintentar,
 * corregir o escalar. Con `type` y `status` puede decidirlo sin leer prosa.
 *
 * Nota de coherencia: ecilost-auth-service responde `{error, message}` porque es un cliente
 * OAuth 2.0 y ese formato lo manda RFC 6749. Catalog es una API REST corriente, asi que usa
 * el formato estandar para APIs.
 */
export interface ProblemDetails {
  /** Identificador estable del tipo de problema. Es lo que un cliente debe ramificar. */
  type: string;
  /** Resumen legible, constante para un mismo `type`. */
  title: string;
  status: number;
  /** Detalle de esta ocurrencia concreta. */
  detail?: string;
  /** Recurso sobre el que ocurrio. */
  instance?: string;
  /** Extension: que campos de la peticion fallaron y por que. */
  errors?: string[];
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** Catalogo de tipos. Centralizarlo evita que cada controlador invente el suyo. */
export const ProblemType = {
  VALIDATION: '/problems/validacion',
  NOT_FOUND: '/problems/objeto-no-encontrado',
  VERSION_CONFLICT: '/problems/conflicto-de-version',
  INVALID_TRANSITION: '/problems/transicion-invalida',
  ITEM_IN_USE: '/problems/objeto-comprometido',
  UNSUPPORTED_MEDIA: '/problems/formato-no-soportado',
  MEDIA_TOO_LARGE: '/problems/archivo-demasiado-grande',
  VIDEO_ALREADY_EXISTS: '/problems/video-ya-existe',
  PHOTO_LIMIT_REACHED: '/problems/limite-de-fotografias',
  UNAUTHENTICATED: '/problems/sin-sesion',
  FORBIDDEN: '/problems/rol-insuficiente',
  INTERNAL: '/problems/error-interno',
} as const;
