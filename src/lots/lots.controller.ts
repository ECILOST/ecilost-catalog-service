import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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
import { LotResponseDto, toLotResponse } from './dto/lot-response.dto.js';

@ApiTags('Lots')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Falta o es invalido el access token.', type: ProblemDetailsDto })
@Controller('lots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Post()
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Agrupar objetos disponibles en un lote', description: 'Crea un lote con al menos dos objetos. La operacion es atomica: si uno ya esta en otro lote activo, no se crea ninguno.' })
  @ApiCreatedResponse({ description: 'Lote activo con todos sus objetos.', type: LotResponseDto })
  @ApiBadRequestResponse({ description: 'El nombre o la lista de objetos es invalida.', type: ProblemDetailsDto })
  @ApiForbiddenResponse({ description: 'Solo un funcionario puede crear lotes.', type: ProblemDetailsDto })
  @ApiNotFoundResponse({ description: 'Algun objeto solicitado no existe.', type: ProblemDetailsDto })
  @ApiConflictResponse({ description: 'Algun objeto esta asignado o ya no esta disponible.', type: ProblemDetailsDto })
  async create(@CurrentUser() principal: Principal, @Body() body: CreateLotDto): Promise<LotResponseDto> {
    return toLotResponse(await this.lotsService.create(body.name, body.itemIds, principal.userId));
  }

  @Get()
  @ApiOperation({ summary: 'Consultar lotes' })
  @ApiOkResponse({ type: [LotResponseDto] })
  async findAll(): Promise<LotResponseDto[]> {
    return (await this.lotsService.findAll()).map(toLotResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un lote con sus objetos' })
  @ApiOkResponse({ type: LotResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LotResponseDto> {
    return toLotResponse(await this.lotsService.findOne(id));
  }
}
