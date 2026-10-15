import type { Prisma } from '../generated/prisma/client.js';
export function customerListOrder(direction?: 'asc' | 'desc'): Prisma.UserOrderByWithRelationInput[] {
  const fallback: Prisma.UserOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
  return direction ? [{ name: direction }, ...fallback] : fallback;
}
