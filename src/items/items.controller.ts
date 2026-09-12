import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../auth/domain/role.enum.js';
import type { Principal } from '../auth/domain/principal.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ItemNotFoundError } from './domain/item-errors.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { ItemResponseDto, toItemResponse } from './dto/item-response.dto.js';
import { ListItemsQueryDto } from './dto/list-items-query.dto.js';
import { ItemsService } from './items.service.js';

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
  constructor(private readonly items: ItemsService) {}

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
    description:
      'Ficha completa del objeto. Incluye `version`, que hay que devolver al editarlo ' +
      'para que el servicio detecte si alguien lo modifico entre medias.',
  })
  @ApiOkResponse({ description: 'El objeto solicitado.', type: ItemResponseDto })
  @ApiNotFoundResponse({
    description: 'No existe un objeto con ese identificador.',
    type: ProblemDetailsDto,
  })
  @ApiBadRequestResponse({
    description: 'El identificador no tiene forma de UUID.',
    type: ProblemDetailsDto,
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ItemResponseDto> {
    try {
      return toItemResponse(await this.items.findById(id));
    } catch (error) {
      // El servicio no conoce codigos HTTP: la traduccion vive aqui, en el adaptador.
      if (error instanceof ItemNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
