import { Injectable } from '@nestjs/common';
import { CreateMediaAssetDto } from './dto/create-media-asset.dto.js';
import { UpdateMediaAssetDto } from './dto/update-media-asset.dto.js';

@Injectable()
export class MediaAssetService {
  create(createMediaAssetDto: CreateMediaAssetDto) {
    return 'This action adds a new mediaAsset';
  }

  findAll() {
    return `This action returns all mediaAsset`;
  }

  findOne(id: number) {
    return `This action returns a #${id} mediaAsset`;
  }

  update(id: number, updateMediaAssetDto: UpdateMediaAssetDto) {
    return `This action updates a #${id} mediaAsset`;
  }

  remove(id: number) {
    return `This action removes a #${id} mediaAsset`;
  }
}
