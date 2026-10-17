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
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Principal } from '../../auth/domain/principal.js';
import { Role } from '../../auth/domain/role.enum.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProblemType } from '../../common/http/problem-details.js';
import { ProblemException } from '../../common/http/problem.exception.js';
import {
  MediaTooLargeError,
  UnsupportedMediaFormatError,
} from '../../media-asset/domain/media-errors.js';
import { MAX_PHOTO_BYTES } from '../../media-asset/domain/media-policy.js';
import {
  LotPhotoResponseDto,
  toLotPhotoResponse,
} from '../dto/lot-photo-response.dto.js';
import {
  LotNotFoundError,
  LotPhotoLimitReachedError,
  LotPhotoNotFoundError,
  LotPhotoService,
  LotVideoNotAllowedError,
} from './lot-photo.service.js';

/** Lo que entrega Multer: los tres campos que se usan, como en la multimedia de objetos. */
interface UploadedMultipartFile {
  size: number;
  buffer: Buffer;
}

/**
 * Fotografias de un lote. Subir y borrar es administrar el catalogo: los dos endpoints son de
 * funcionario. La lectura no vive aqui, sino dentro del lote (`GET /lots`, `GET /lots/:id`).
 */
@ApiTags('Lots')
@ApiBearerAuth('access-token')
@Controller('lots/:lotId/photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF)
export class LotPhotoController {
  constructor(private readonly photos: LotPhotoService) {}

  @Post()
  @UseInterceptors(
    // Tope duro del transporte a la medida de una foto: un lote no admite video.
    FileInterceptor('file', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Adjuntar una fotografia al lote' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: LotPhotoResponseDto })
  async upload(
    @CurrentUser() principal: Principal,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<LotPhotoResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Falta el archivo. Envialo como multipart/form-data en el campo `file`.',
      );
    }
    try {
      return toLotPhotoResponse(
        await this.photos.attach({
          lotId,
          uploadedBy: principal.userId,
          file: { content: file.buffer, sizeBytes: file.size },
        }),
      );
    } catch (error) {
      throw asHttp(error);
    }
  }

  @Delete(':photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar una fotografia del lote' })
  @ApiNoContentResponse({
    description: 'La fotografia ya no forma parte del lote.',
  })
  async remove(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ): Promise<void> {
    try {
      await this.photos.remove(lotId, photoId);
    } catch (error) {
      throw asHttp(error);
    }
  }
}

/** Los mismos codigos y tipos de problema que la multimedia de un objeto. */
function asHttp(error: unknown): unknown {
  if (
    error instanceof UnsupportedMediaFormatError ||
    error instanceof LotVideoNotAllowedError
  ) {
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
  if (error instanceof LotPhotoLimitReachedError) {
    return new ProblemException(
      HttpStatus.CONFLICT,
      ProblemType.PHOTO_LIMIT_REACHED,
      'El lote llego al tope de fotografias',
      error.message,
    );
  }
  if (
    error instanceof LotNotFoundError ||
    error instanceof LotPhotoNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  return error;
}
