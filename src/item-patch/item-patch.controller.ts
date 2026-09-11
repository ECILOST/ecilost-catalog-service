import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ItemPatchService } from './item-patch.service.js';
import { CreateItemPatchDto } from './dto/create-item-patch.dto.js';
import { UpdateItemPatchDto } from './dto/update-item-patch.dto.js';

@Controller('item-patch')
export class ItemPatchController {
  constructor(private readonly itemPatchService: ItemPatchService) {}

  @Post()
  create(@Body() createItemPatchDto: CreateItemPatchDto) {
    return this.itemPatchService.create(createItemPatchDto);
  }

  @Get()
  findAll() {
    return this.itemPatchService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemPatchService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateItemPatchDto: UpdateItemPatchDto) {
    return this.itemPatchService.update(+id, updateItemPatchDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.itemPatchService.remove(+id);
  }
}
