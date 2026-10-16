import type { Prisma } from '../generated/prisma/client.js';
export function conversationListOrder(field?: 'subject' | 'department' | 'assignedAgent', direction: 'asc' | 'desc' = 'asc'): Prisma.ConversationOrderByWithRelationInput[] {
  const fallback: Prisma.ConversationOrderByWithRelationInput[] = [{ updatedAt: 'desc' }, { id: 'desc' }];
  if (!field) return fallback;
  const selected: Prisma.ConversationOrderByWithRelationInput = field === 'subject' ? { subject: direction } : field === 'department' ? { department: { name: direction } } : { assignedAgent: { name: direction } };
  return [selected, ...fallback];
}
