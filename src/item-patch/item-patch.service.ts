import { Injectable } from '@nestjs/common';
import { CreateItemPatchDto } from './dto/create-item-patch.dto.js';
import { UpdateItemPatchDto } from './dto/update-item-patch.dto.js';

@Injectable()
export class ItemPatchService {
  create(createItemPatchDto: CreateItemPatchDto) {
    return 'This action adds a new itemPatch';
  }

  findAll() {
    return `This action returns all itemPatch`;
  }

  findOne(id: number) {
    return `This action returns a #${id} itemPatch`;
  }

  update(id: number, updateItemPatchDto: UpdateItemPatchDto) {
    return `This action updates a #${id} itemPatch`;
  }

  remove(id: number) {
    return `This action removes a #${id} itemPatch`;
  }
}
