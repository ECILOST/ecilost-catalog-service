import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  PROBLEM_CONTENT_TYPE,
  ProblemType,
  type ProblemDetails,
} from '../http/problem-details.js';

/**
 * Traduce cualquier excepcion al cuerpo de error publicado por el servicio.
 *
 * Va en un filtro global y no en cada controlador para que un endpoint nuevo no pueda
 * responder un formato distinto por olvido. El detalle tecnico de un 500 se queda en el
 * log: al cliente solo le llega que fallo del lado del servidor.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = this.toProblem(exception, request.url);

    if (problem.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url}`, asStack(exception));
    }

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    if (!(exception instanceof HttpException)) {
      return {
        type: ProblemType.INTERNAL,
        title: 'Error interno del servicio',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        instance,
      };
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    // Una ProblemException ya trae su tipo y su titulo: se respetan tal cual.
    if (isExplicitProblem(body)) {
      return { ...body, status, instance };
    }

    // ValidationPipe entrega un arreglo de mensajes, uno por regla incumplida. Se publican
    // tal cual porque el criterio de HU-03 exige decir cual campo falta.
    const messages = extractMessages(body);

    if (status === HttpStatus.BAD_REQUEST && messages.length > 1) {
      return {
        type: ProblemType.VALIDATION,
        title: 'La peticion no es valida',
        status,
        detail: 'Uno o mas campos no cumplen el contrato.',
        instance,
        errors: messages,
      };
    }

    return {
      type: typeFor(status),
      title: titleFor(status),
      status,
      detail: messages[0] ?? exception.message,
      instance,
      ...(status === HttpStatus.BAD_REQUEST && messages.length > 0
        ? { errors: messages }
        : {}),
    };
  }
}

function isExplicitProblem(body: unknown): body is ProblemDetails {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { type?: unknown }).type === 'string' &&
    typeof (body as { title?: unknown }).title === 'string'
  );
}

function extractMessages(body: unknown): string[] {
  if (typeof body === 'string') return [body];
  if (typeof body !== 'object' || body === null) return [];

  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String);
  if (typeof message === 'string') return [message];
  return [];
}

function typeFor(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ProblemType.VALIDATION;
    case HttpStatus.UNAUTHORIZED:
      return ProblemType.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ProblemType.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ProblemType.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ProblemType.VERSION_CONFLICT;
    default:
      return ProblemType.INTERNAL;
  }
}

function titleFor(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'La peticion no es valida';
    case HttpStatus.UNAUTHORIZED:
      return 'Se requiere iniciar sesion';
    case HttpStatus.FORBIDDEN:
      return 'Tu rol no permite esta operacion';
    case HttpStatus.NOT_FOUND:
      return 'El recurso no existe';
    case HttpStatus.CONFLICT:
      return 'Conflicto con el estado actual del recurso';
    default:
      return 'Error interno del servicio';
  }
}

function asStack(exception: unknown): string {
  return exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
}
