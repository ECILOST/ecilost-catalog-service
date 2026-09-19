import { PartialType } from '@nestjs/mapped-types';
import { CreateLotDto } from './create-lot.dto.js';

export class UpdateLotDto extends PartialType(CreateLotDto) {}
