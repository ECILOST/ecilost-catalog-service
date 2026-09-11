import { PartialType } from '@nestjs/mapped-types';
import { CreateMediaAssetDto } from './create-media-asset.dto.js';

export class UpdateMediaAssetDto extends PartialType(CreateMediaAssetDto) {}
