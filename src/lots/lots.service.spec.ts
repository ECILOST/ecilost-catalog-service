import { describe, expect, it, vi } from 'vitest';
import { LotsService } from './lots.service.js';

describe('LotsService.findAll', () => {
  it('sin ids devuelve todos, como siempre', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new LotsService({ lot: { findMany } } as never).findAll();
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('con ids pide solo esos lotes, en una consulta', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new LotsService({ lot: { findMany } } as never).findAll(['a', 'b']);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: ['a', 'b'] } });
  });
});
