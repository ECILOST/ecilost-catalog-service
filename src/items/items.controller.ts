import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Role } from '../auth/domain/role.enum.js';
import type { Principal } from '../auth/domain/principal.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ProblemType } from '../common/http/problem-details.js';
import { ProblemException } from '../common/http/problem.exception.js';
import { MediaAssetService } from '../media-asset/media-asset.service.js';
import {
  InvalidStatusTransitionError,
  ItemInUseError,
  ItemNotFoundError,
} from './domain/item-errors.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { DeleteItemQueryDto } from './dto/delete-item-query.dto.js';
import {
  ItemDetailResponseDto,
  ItemFichaResponseDto,
  ItemResponseDto,
  toItemDetailResponse,
  toItemFichaResponse,
  toItemResponse,
} from './dto/item-response.dto.js';
import { ListItemsQueryDto } from './dto/list-items-query.dto.js';
import { UpdateItemDto, toItemPatch } from './dto/update-item.dto.js';
import { ItemsService } from './items.service.js';
import { ItemVersionConflictError } from './ports/item.repository.js';

@ApiTags('Items')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Falta el access token o no verifica contra la JWKS del emisor.',
  type: ProblemDetailsDto,
})
@Controller('items')
// Todo el catalogo exige sesion. El rol solo se restringe donde se escribe.
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly media: MediaAssetService,
  ) {}

  @Post()
  @Roles(Role.STAFF)
  @ApiOperation({
    summary: 'Registrar un objeto perdido',
    description: [
      'Da de alta un objeto en el catalogo. Operacion de funcionario.',
      '',
      'El objeto nace en estado `AVAILABLE` y sin sala asociada. El estado no se acepta en',
      'la peticion a proposito: permitir escribirlo dejaria registrar algo ya marcado como',
      'vendido.',
      '',
      'Las fotografias y el video no se envian aqui. Se adjuntan despues contra el objeto',
      'ya creado, porque registrar y subir archivos son operaciones distintas y fallan por',
      'razones distintas.',
    ].join('\n'),
  })
  @ApiCreatedResponse({
    description: 'El objeto quedo registrado y disponible para asignarlo a una ronda.',
    type: ItemResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Falta un campo obligatorio o no cumple el contrato. `errors` nombra cual y por que.',
    type: ProblemDetailsDto,
  })
  @ApiForbiddenResponse({
    description: 'La sesion es valida pero el rol no administra el catalogo.',
    type: ProblemDetailsDto,
  })
  async create(
    @CurrentUser() principal: Principal,
    @Body() body: CreateItemDto,
  ): Promise<ItemResponseDto> {
    const item = await this.items.register({
      name: body.name,
      description: body.description,
      condition: body.condition,
      category: body.category,
      registeredBy: principal.userId,
    });
    return toItemResponse(item);
  }

  @Get()
  @ApiOperation({
    summary: 'Consultar el catalogo',
    description: [
      'Lista los objetos registrados, del mas reciente al mas antiguo.',
      '',
      'Abierto a cualquier sesion valida, no solo a funcionarios: el estudiante necesita',
      'consultar el catalogo antes de participar en una sala.',
      '',
      'La pagina tiene tope maximo. Una consulta sin limite funciona con veinte objetos y',
      'se convierte en un problema con veinte mil.',
    ].join('\n'),
  })
  @ApiOkResponse({ description: 'Los objetos que cumplen el filtro.', type: [ItemResponseDto] })
  @ApiBadRequestResponse({
    description: 'Un filtro o un parametro de pagina no es valido.',
    type: ProblemDetailsDto,
  })
  async findAll(@Query() query: ListItemsQueryDto): Promise<ItemResponseDto[]> {
    const items = await this.items.findAll({
      status: query.status,
      category: query.category,
      limit: query.limit,
      offset: query.offset,
    });
    return items.map(toItemResponse);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar un objeto',
    description: [
      'Ficha del objeto: sus datos, sus fotografias y su video.',
      '',
      '**La respuesta depende del rol.** El funcionario recibe la ficha completa, con',
      '`version`, que hay que devolverle al editar para que el servicio detecte si alguien',
      'lo modifico entre medias, y con el rastro de quien lo registro y lo cambio. El',
      'estudiante recibe la ficha de inspeccion (HU-08), que es la misma sin esos cuatro',
      'campos: identifican a funcionarios concretos y no le sirven para decidir si pujar.',
      '',
      'La multimedia viaja aqui y no en un recurso aparte para que abrir una ficha sea una',
      'sola peticion. `photos` puede venir vacio y `video` puede venir en `null`, pero',
      'ninguno de los dos campos falta nunca: un objeto sin video se renderiza igual de',
      'bien que uno con video.',
      '',
      'Los enlaces de cada pieza apuntan al almacen, no a este servicio, asi que el',
      'navegador baja los archivos directamente. Son estables mientras siguen vigentes: dos',
      'estudiantes que abren la misma ficha reciben el mismo enlace, y volver a abrirla no',
      'obliga al navegador a descargar el video de nuevo.',
    ].join('\n'),
  })
  @ApiExtraModels(ItemDetailResponseDto, ItemFichaResponseDto)
  @ApiOkResponse({
    description:
      'La ficha completa si quien pregunta es `STAFF`, y la de inspeccion si es `STUDENT`.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ItemDetailResponseDto) },
        { $ref: getSchemaPath(ItemFichaResponseDto) },
      ],
    },
  })
  @ApiNotFoundResponse({
    description: 'No existe un objeto con ese identificador.',
    type: ProblemDetailsDto,
  })
  @ApiBadRequestResponse({
    description: 'El identificador no tiene forma de UUID.',
    type: ProblemDetailsDto,
  })
  async findOne(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ItemDetailResponseDto | ItemFichaResponseDto> {
    try {
      const item = await this.items.findById(id);
      // Se pide despues de confirmar que el objeto existe: firmar las URL de una ficha que
      // va a responder 404 seria trabajo tirado.
      const completa = toItemDetailResponse(item, await this.media.findByItem(id));

      // El recorte va al final y no en la consulta: lo que cambia entre un rol y otro es
      // que se publica, no que se lee. Repartir esa decision entre el servicio y el
      // repositorio dejaria dos sitios donde equivocarse.
      return principal.canManageCatalog() ? completa : toItemFichaResponse(completa);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  @Patch(':id')
  @Roles(Role.STAFF)
  @ApiOperation({
    summary: 'Editar un objeto registrado',
    description: [
      'Cambia los datos de un objeto del catalogo. Operacion de funcionario.',
      '',
      '**Hay que enviar `version`**, la que vino en el `GET`. El servicio escribe solo si',
      'esa version sigue siendo la vigente, y responde `409` si no lo es. Sin ese control,',
      'dos funcionarios editando la misma ficha a la vez se pisarian en silencio y el',
      'segundo en guardar borraria el cambio del primero.',
      '',
      'Cada campo ausente se deja como estaba. Cada escritura aceptada incrementa la',
      'version y registra quien la hizo y cuando.',
      '',
      'Sobre `status`: solo se admite retirar y reponer. Los demas estados los mueven la',
      'creacion de lotes, la programacion de la sala y la adjudicacion, nunca este',
      'formulario.',
    ].join('\n'),
  })
  @ApiOkResponse({
    description: 'El objeto despues del cambio, con la version ya incrementada.',
    type: ItemResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Falta `version` o algun campo no cumple el contrato.',
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
  @ApiConflictResponse({
    description: [
      'Dos motivos distintos, separados por el campo `type`:',
      '',
      '- `conflicto-de-version`: otra persona edito el objeto despues de que tu lo leyeras.',
      '  Vuelve a cargarlo, revisa el cambio ajeno y reintenta.',
      '- `transicion-invalida`: el estado que pediste no se puede escribir a mano.',
    ].join('\n'),
    type: ProblemDetailsDto,
  })
  async update(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemDto,
  ): Promise<ItemResponseDto> {
    try {
      const item = await this.items.update({
        id,
        expectedVersion: body.version,
        patch: toItemPatch(body),
        lastModifiedBy: principal.userId,
      });
      return toItemResponse(item);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  @Delete(':id')
  @Roles(Role.STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Borrar un objeto del catalogo',
    description: [
      'Elimina un objeto que no este comprometido. Operacion de funcionario.',
      '',
      '**Hay que enviar `version`** en la consulta, la que vino en el `GET`.',
      '',
      'Un objeto asignado a una ronda no se borra: la respuesta `409` nombra la ronda que',
      'lo retiene. Lo mismo vale para uno que pertenece a un lote, y para uno ya vendido,',
      'cuyo historial debe conservarse.',
      '',
      'La condicion se evalua dentro de la propia sentencia de borrado, no antes: si el',
      'objeto entra a una ronda en ese instante, el borrado no encuentra fila y falla, en',
      'lugar de dejar la ronda apuntando a algo que ya no existe.',
    ].join('\n'),
  })
  @ApiNoContentResponse({ description: 'El objeto se elimino del catalogo.' })
  @ApiBadRequestResponse({
    description: 'Falta `version` en la consulta, o el identificador no es un UUID.',
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
  @ApiConflictResponse({
    description: [
      'Dos motivos distintos, separados por el campo `type`:',
      '',
      '- `objeto-comprometido`: esta en una ronda, en un lote, o ya fue vendido. El campo',
      '  `detail` dice cual.',
      '- `conflicto-de-version`: otra persona lo edito despues de que tu lo leyeras.',
    ].join('\n'),
    type: ProblemDetailsDto,
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteItemQueryDto,
  ): Promise<void> {
    try {
      await this.items.remove(id, query.version);
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
    if (error instanceof ItemNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof ItemInUseError) {
      return new ProblemException(
        HttpStatus.CONFLICT,
        ProblemType.ITEM_IN_USE,
        'El objeto esta comprometido',
        error.message,
      );
    }
    if (error instanceof ItemVersionConflictError) {
      return new ProblemException(
        HttpStatus.CONFLICT,
        ProblemType.VERSION_CONFLICT,
        'El objeto cambio desde que lo leiste',
        error.message,
      );
    }
    if (error instanceof InvalidStatusTransitionError) {
      return new ProblemException(
        HttpStatus.CONFLICT,
        ProblemType.INVALID_TRANSITION,
        'Ese cambio de estado no se hace desde el catalogo',
        error.message,
      );
    }
    return error;
  }
}
