import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

type Filters = { view?: 'movements' | 'people'; personId?: string; agreementId?: string; startsOn?: string; endsOn?: string; page: number; limit: number; allRecords?: boolean };
export async function creditHistoryReport(tx: Prisma.TransactionClient, scope: Prisma.CreditChargeWhereInput, input: Filters) {
  if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) throw new AppError(400, 'INVALID_DATE_RANGE', 'Bitiş tarihi başlangıçtan önce olamaz.');
  const conversationSelect = { id: true, number: true, subject: true, customer: { select: { id: true, name: true } } } as const;
  // Include returned charges through their conversation, while preserving company scope.
  const conversations = await tx.conversation.findMany({
    where: { OR: [scope.conversation ?? { OR: (Array.isArray(scope.OR) ? scope.OR : []).flatMap(row => row.conversation ? [row.conversation] : []) }, { creditCharge: { is: scope } }] }, select: conversationSelect,
  });
  const byId = new Map(conversations.map(row => [row.id, row]));
  const current = await tx.creditCharge.findMany({ where: scope, include: { agreement: { select: { id: true, name: true } }, conversation: { select: conversationSelect } } });
  const returned = await tx.activityLog.findMany({ where: { entityType: 'Conversation', entityId: { in: [...byId.keys()] }, action: 'conversation.credit_returned' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  type Movement = { id: string; credits: number; kind: 'USED' | 'RETURNED'; createdAt: Date; agreement: { id: string; name: string } | null; conversation: typeof conversations[number] };
  const movements: Movement[] = current.map(row => ({ ...row, kind: 'USED' }));
  const agreementIds = new Set(current.flatMap(row => row.agreementId ? [row.agreementId] : []));
  for (const log of returned) { const meta = log.metadata as Record<string, unknown> | null; if (typeof meta?.agreementId === 'string') agreementIds.add(meta.agreementId); }
  const agreements = await tx.agreement.findMany({ where: { id: { in: [...agreementIds] } }, select: { id: true, name: true } });
  const grants = new Map(agreements.map(row => [row.id, row]));
  const seen = new Set(current.map(row => row.id));
  for (const log of returned) {
    const meta = log.metadata as Record<string, unknown> | null, conversation = byId.get(log.entityId);
    if (!conversation || !meta || typeof meta.credits !== 'number' || meta.credits < 0) continue;
    const agreement = typeof meta.agreementId === 'string' ? grants.get(meta.agreementId) ?? null : null;
    const chargeId = typeof meta.chargeId === 'string' ? meta.chargeId : log.id;
    if (!seen.has(chargeId) && typeof meta.chargedAt === 'string' && Number.isFinite(Date.parse(meta.chargedAt))) {
      movements.push({ id: chargeId, credits: meta.credits, kind: 'USED', createdAt: new Date(meta.chargedAt), agreement, conversation }); seen.add(chargeId);
    }
    movements.push({ id: log.id, credits: meta.credits, kind: 'RETURNED', createdAt: log.createdAt, agreement, conversation });
  }
  const people = [...new Map(conversations.map(row => [row.customer.id, row.customer])).values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const filtered = movements.filter(row => {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(row.createdAt);
    return (!input.personId || row.conversation.customer.id === input.personId) && (!input.agreementId || row.agreement?.id === input.agreementId) && (!input.startsOn || day >= input.startsOn) && (!input.endsOn || day <= input.endsOn);
  });
  const grouped = new Map<string, { id: string; name: string; spent: number; returned: number; net: number; tickets: Set<string> }>();
  for (const row of filtered) {
    const person = row.conversation.customer;
    const entry = grouped.get(person.id) ?? { ...person, spent: 0, returned: 0, net: 0, tickets: new Set<string>() };
    entry[row.kind === 'USED' ? 'spent' : 'returned'] += row.credits; entry.net = entry.spent - entry.returned; entry.tickets.add(row.conversation.id); grouped.set(person.id, entry);
  }
  const summary = { spent: filtered.filter(row => row.kind === 'USED').reduce((sum, row) => sum + row.credits, 0), returned: filtered.filter(row => row.kind === 'RETURNED').reduce((sum, row) => sum + row.credits, 0), net: 0, tickets: new Set(filtered.map(row => row.conversation.id)).size };
  summary.net = summary.spent - summary.returned;
  const rows = input.view === 'people' ? [...grouped.values()].map(({ tickets, ...row }) => ({ ...row, ticketCount: tickets.size })).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name, 'tr')) : filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const total = rows.length, totalPages = Math.max(1, Math.ceil(total / input.limit)), page = Math.min(input.page, totalPages);
  return { data: input.allRecords ? rows : rows.slice((page - 1) * input.limit, page * input.limit), summary, people, agreements, pagination: { page, limit: input.limit, total, totalPages } };
}
