import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { MysteryService } from './mystery.service.js';

@ApiTags('Mystery')
@ApiBearerAuth('access-token')
@Controller('mystery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MysteryController {
  constructor(private readonly mystery: MysteryService) {}

  @Get('rounds/:roundId')
  @ApiOperation({
    summary: 'Pistas de un lote misterioso',
    description: [
      'Lo que se puede saber de los objetos de una ronda que salio como lote misterioso en la',
      'ruleta de auction: categoria, condicion y las pistas del funcionario. Nunca el nombre, la',
      'descripcion, las fotos ni el identificador. Si la ronda no es misteriosa, `entries` viene vacio.',
    ].join('\n'),
  })
  @ApiOkResponse({ description: 'Las pistas de cada entrada oculta de la ronda.' })
  clues(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.mystery.cluesForRound(roundId);
  }
}
