import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Role } from '../auth/domain/role.enum.js';
import type { Principal } from '../auth/domain/principal.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { LotsService } from './lots.service.js';
import { CreateLotDto } from './dto/create-lot.dto.js';
import { ListLotsQueryDto } from './dto/list-lots-query.dto.js';
import { type LotItemPhoto, LotResponseDto, toLotResponse } from './dto/lot-response.dto.js';
import { isHiddenFrom } from '../items/entities/item.entity.js';
import { MediaAssetService } from '../media-asset/media-asset.service.js';
import type { Lot } from './entities/lot.entity.js';

@ApiTags('Lots')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Falta o es invalido el access token.', type: ProblemDetailsDto })
@Controller('lots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LotsController {
  constructor(
    private readonly lotsService: LotsService,
    private readonly media: MediaAssetService,
  ) {}

  @Post()
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Agrupar objetos disponibles en un lote', description: 'Crea un lote con al menos dos objetos. La operacion es atomica: si uno ya esta en otro lote activo, no se crea ninguno.' })
  @ApiCreatedResponse({ description: 'Lote activo con todos sus objetos.', type: LotResponseDto })
  @ApiBadRequestResponse({ description: 'El nombre o la lista de objetos es invalida.', type: ProblemDetailsDto })
  @ApiForbiddenResponse({ description: 'Solo un funcionario puede crear lotes.', type: ProblemDetailsDto })
  @ApiNotFoundResponse({ description: 'Algun objeto solicitado no existe.', type: ProblemDetailsDto })
  @ApiConflictResponse({ description: 'Algun objeto esta asignado o ya no esta disponible.', type: ProblemDetailsDto })
  async create(@CurrentUser() principal: Principal, @Body() body: CreateLotDto): Promise<LotResponseDto> {
    const lot = await this.lotsService.create(body.name, body.itemIds, principal.userId);
    return toLotResponse(lot, null, await this.photosOf(lot, viewerOf(principal)));
  }

  @Get()
  @ApiOperation({ summary: 'Consultar lotes' })
  @ApiOkResponse({ type: [LotResponseDto] })
  async findAll(@CurrentUser() principal: Principal, @Query() query: ListLotsQueryDto): Promise<LotResponseDto[]> {
    const lots = await this.lotsService.findAll(query.ids, viewerOf(principal));
    // Una consulta para las portadas de todos los objetos del listado, no una por lote. La
    // portada del lote es la del primer objeto que tenga fotografia.
    const viewer = viewerOf(principal);
    const covers = await this.media.findCovers(lots.flatMap((lot) => visibleItems(lot, viewer).map((item) => item.id)));
    return lots.map((lot) => {
      const first = visibleItems(lot, viewer).find((item) => covers.has(item.id));
      return toLotResponse(lot, first ? (covers.get(first.id) ?? null) : null);
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un lote con sus objetos' })
  @ApiOkResponse({ type: LotResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async findOne(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string): Promise<LotResponseDto> {
    // Se pide despues de confirmar que el lote existe y es visible para quien consulta.
    const lot = await this.lotsService.findOne(id, viewerOf(principal));
    return toLotResponse(lot, null, await this.photosOf(lot, viewerOf(principal)));
  }

  /**
   * Las fotografias que ya tiene cada objeto del lote, en el orden de los objetos. Un lote
   * agrupa pocos objetos, asi que se pide la multimedia de cada uno en paralelo.
   */
  private async photosOf(lot: Lot, viewer: Viewer): Promise<LotItemPhoto[]> {
    const items = visibleItems(lot, viewer);
    const media = await Promise.all(items.map((item) => this.media.findByItem(item.id)));
    return items.flatMap((item, i) => media[i].photos.map((photo) => ({ ...photo, itemName: item.name })));
  }
}

/** Quien consulta, para ocultar al estudiante lo que esconde un lote misterioso (ADR-0002). */
const viewerOf = (principal: Principal) => ({ userId: principal.userId, canManageCatalog: principal.canManageCatalog() });

type Viewer = ReturnType<typeof viewerOf>;

/** Los objetos cuyas fotos puede ver quien consulta: uno misterioso no muestra las suyas. */
const visibleItems = (lot: Lot, viewer: Viewer) => lot.items.filter((item) => !isHiddenFrom(item, viewer));
