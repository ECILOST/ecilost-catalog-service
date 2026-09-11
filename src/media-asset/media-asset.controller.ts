import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MediaAssetService } from './media-asset.service.js';
import { CreateMediaAssetDto } from './dto/create-media-asset.dto.js';
import { UpdateMediaAssetDto } from './dto/update-media-asset.dto.js';

@Controller('media-asset')
export class MediaAssetController {
  constructor(private readonly mediaAssetService: MediaAssetService) {}

  @Post()
  create(@Body() createMediaAssetDto: CreateMediaAssetDto) {
    return this.mediaAssetService.create(createMediaAssetDto);
  }

  @Get()
  findAll() {
    return this.mediaAssetService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mediaAssetService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMediaAssetDto: UpdateMediaAssetDto) {
    return this.mediaAssetService.update(+id, updateMediaAssetDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.mediaAssetService.remove(+id);
  }
}
