import { PartialType } from '@nestjs/mapped-types';
import { CreateItemPatchDto } from './create-item-patch.dto.js';

export class UpdateItemPatchDto extends PartialType(CreateItemPatchDto) {}
