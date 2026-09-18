import { ApiProperty } from '@nestjs/swagger';
import type { Lot } from '../entities/lot.entity.js';

export class LotItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class LotResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'IN_ROUND', 'CLOSED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: [LotItemResponseDto] }) items: LotItemResponseDto[];
  @ApiProperty() createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export function toLotResponse(lot: Lot): LotResponseDto {
  return { ...lot, items: lot.items.map((item) => ({ id: item.id, name: item.name })) };
}
