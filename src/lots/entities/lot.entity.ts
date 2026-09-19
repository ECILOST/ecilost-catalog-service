import type { LotStatus } from '../../generated/prisma/enums.js';
import type { Item } from '../../items/entities/item.entity.js';

export interface Lot {
  id: string;
  name: string;
  status: LotStatus;
  createdBy: string;
  createdAt: Date;
  items: Item[];
}
