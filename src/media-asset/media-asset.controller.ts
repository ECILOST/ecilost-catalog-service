import {
  BadRequestException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Principal } from '../auth/domain/principal.js';
import { Role } from '../auth/domain/role.enum.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ProblemType } from '../common/http/problem-details.js';
import { ProblemException } from '../common/http/problem.exception.js';
import {
  MediaAssetNotFoundError,
  MediaTooLargeError,
  PhotoLimitReachedError,
  UnsupportedMediaFormatError,
} from './domain/media-errors.js';
import { SUPPORTED_LABELS } from './domain/media-format.js';
import { MAX_UPLOAD_BYTES, asMegabytes } from './domain/media-policy.js';
import { MediaResponseDto, toMediaResponse } from './dto/media-response.dto.js';
import { MediaAssetService } from './media-asset.service.js';
import {
  MediaOwnerNotFoundError,
  VideoAlreadyExistsError,
} from './ports/media-asset.repository.js';

/**
 * Lo que entrega Multer. Se declara aqui, con los tres campos que se usan, en vez de
 * depender de la ampliacion global de `@types/multer`, que obligaria a tocar la lista
 * `types` de tsconfig.json para una interfaz de tres lineas.
 */
interface UploadedMultipartFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Multimedia')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Falta el access token o no verifica contra la JWKS del emisor.',
  type: ProblemDetailsDto,
})
@ApiParam({
  name: 'itemId',
  format: 'uuid',
  description: 'Objeto al que pertenece la ficha.',
})
@Controller('items/:itemId/media')
// Subir y borrar multimedia es administrar el catalogo: los dos endpoints son de
// funcionario. La lectura no vive aqui, sino dentro de la ficha del objeto.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF)
export class MediaAssetController {
  constructor(private readonly media: MediaAssetService) {}

  @Post()
  @UseInterceptors(
    // Tope duro del transporte: corta la subida mientras se lee, sin llegar a juntar el
    // archivo entero en memoria. El tope por tipo lo aplica despues el caso de uso, que es
    // el que sabe si son cinco megabytes de foto o cien de video.
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Adjuntar una fotografia o el video del objeto',
    description: [
      'Sube una pieza multimedia y la asocia al objeto. Operacion de funcionario.',
      '',
      'Se envia como `multipart/form-data` con un unico campo llamado `file`. Un objeto',
      'admite varias fotografias y **a lo sumo un video**: la ficha habla de un video en',
      'singular, y sin esa regla el cliente tendria que adivinar cual mostrar.',
      '',
      'El tipo del archivo se deduce de sus primeros bytes, no de la extension ni del',
      '`Content-Type` que declara el cliente. Los dos los escribe quien sube el archivo,',
      'asi que renombrar uno bastaria para saltarse la validacion.',
      '',
      'Un archivo rechazado no deja rastro: la ficha del objeto queda exactamente como',
      'estaba, sin piezas a medio subir.',
      '',
      `Formatos admitidos: ${SUPPORTED_LABELS.join(', ')}.`,
    ].join('\n'),
  })
  @ApiBody({
    description: 'Formulario con el archivo en el campo `file`.',
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: `La fotografia o el video. Formatos: ${SUPPORTED_LABELS.join(', ')}.`,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'La pieza quedo adjunta y ya aparece en la ficha del objeto.',
    type: MediaResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'No vino ningun archivo, o el identificador del objeto no es un UUID.',
    type: ProblemDetailsDto,
  })
  @ApiForbiddenResponse({
    description: 'La sesion es valida pero el rol no administra el catalogo.',
    type: ProblemDetailsDto,
  })
  @ApiNotFoundResponse({
    description: 'No existe un objeto con ese identificador.',
    type: ProblemDetailsDto,
  })
  @ApiUnsupportedMediaTypeResponse({
    description:
      'El archivo no es de un tipo soportado. El `detail` enumera los que si se admiten ' +
      'y la ficha no se altero.',
    type: ProblemDetailsDto,
  })
  @ApiPayloadTooLargeResponse({
    description: `El archivo supera el maximo de su tipo, o los ${asMegabytes(MAX_UPLOAD_BYTES)} MB del transporte.`,
    type: ProblemDetailsDto,
  })
  @ApiConflictResponse({
    description: [
      'Dos motivos distintos, separados por el campo `type`:',
      '',
      '- `video-ya-existe`: el objeto ya tiene video. Borra el actual antes de subir otro.',
      '- `limite-de-fotografias`: el objeto llego al tope de fotografias.',
    ].join('\n'),
    type: ProblemDetailsDto,
  })
  async upload(
    @CurrentUser() principal: Principal,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<MediaResponseDto> {
    // Sin archivo no hay nada que reconocer. Es un fallo de forma de la peticion, no del
    // contenido, asi que sale como 400 y no como 415.
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Falta el archivo. Envialo como multipart/form-data en el campo `file`.',
      );
    }

    try {
      const asset = await this.media.attach({
        itemId,
        uploadedBy: principal.userId,
        file: { content: file.buffer, sizeBytes: file.size },
      });
      return toMediaResponse(asset);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({
    name: 'mediaId',
    format: 'uuid',
    description: 'Pieza que se quiere retirar.',
  })
  @ApiOperation({
    summary: 'Quitar una pieza multimedia del objeto',
    description: [
      'Retira una fotografia o el video de la ficha. Operacion de funcionario.',
      '',
      'Solo afecta a la pieza nombrada: el resto del contenido del objeto queda intacto.',
      'La pertenencia se comprueba dentro de la propia sentencia de borrado, asi que un',
      'identificador de otra ficha responde `404` en vez de borrar algo ajeno.',
      '',
      'Primero desaparece de la ficha y despues se retira el archivo del almacen. El orden',
      'inverso dejaria, durante un instante, una imagen rota delante del estudiante.',
    ].join('\n'),
  })
  @ApiNoContentResponse({
    description: 'La pieza ya no forma parte de la ficha.',
  })
  @ApiBadRequestResponse({
    description: 'Alguno de los dos identificadores no tiene forma de UUID.',
    type: ProblemDetailsDto,
  })
  @ApiForbiddenResponse({
    description: 'La sesion es valida pero el rol no administra el catalogo.',
    type: ProblemDetailsDto,
  })
  @ApiNotFoundResponse({
    description: 'Ese objeto no tiene multimedia con ese identificador.',
    type: ProblemDetailsDto,
  })
  async remove(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<void> {
    try {
      await this.media.remove(itemId, mediaId);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  /**
   * Traduce los errores de dominio a HTTP. El servicio no conoce codigos de estado: esa
   * decision es del adaptador, y tenerla en un solo sitio evita que dos endpoints
   * respondan distinto ante el mismo fallo.
   */
  private asHttp(error: unknown): unknown {
    if (error instanceof UnsupportedMediaFormatError) {
      // 415 y no 400: la peticion esta bien formada, lo que no se admite es el contenido.
      return new ProblemException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ProblemType.UNSUPPORTED_MEDIA,
        'El archivo no es de un tipo soportado',
        error.message,
      );
    }
    if (error instanceof MediaTooLargeError) {
      return new ProblemException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        ProblemType.MEDIA_TOO_LARGE,
        'El archivo pesa demasiado',
        error.message,
      );
    }
    if (error instanceof VideoAlreadyExistsError) {
      return new ProblemException(
        HttpStatus.CONFLICT,
        ProblemType.VIDEO_ALREADY_EXISTS,
        'El objeto ya tiene video',
        error.message,
      );
    }
    if (error instanceof PhotoLimitReachedError) {
      return new ProblemException(
        HttpStatus.CONFLICT,
        ProblemType.PHOTO_LIMIT_REACHED,
        'El objeto llego al tope de fotografias',
        error.message,
      );
    }
    if (error instanceof MediaOwnerNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof MediaAssetNotFoundError) {
      return new NotFoundException(error.message);
    }
    return error;
  }
}
