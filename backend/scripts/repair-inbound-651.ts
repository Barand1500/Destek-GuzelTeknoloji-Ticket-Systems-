import { db } from '../src/config/db.js';
import { notifyConversation } from '../src/services/events.service.js';

try {
  const result = await db.$transaction(async tx => {
    const source = await tx.conversation.findUniqueOrThrow({ where: { id: '0c12ba2e-8e65-4902-89e9-e8539ad4536b' }, include: { messages: true, incomingEmails: true } });
    const target = await tx.conversation.findUniqueOrThrow({ where: { id: '0f980c84-03c5-4a80-bb6c-f9a5a9ce21d6' }, include: { customer: true } });
    if (source.deletedAt && source.messages.length === 0) return { alreadyRepaired: true };
    if (target.deletedAt || target.customer.email !== 'yunusdurgun22@gmail.com' || source.number !== 651 || target.number !== 650 || source.messages.length !== 1 || source.incomingEmails.length !== 1 || source.incomingEmails[0].uid !== 193 || source.messages[0].id !== 'fce86911-c333-4e07-aa77-d4493e3d535c') throw new Error('Repair preconditions changed; nothing updated.');
    await tx.conversationMessage.update({ where: { id: source.messages[0].id }, data: { conversationId: target.id, authorId: target.customerId } });
    await tx.incomingEmail.update({ where: { id: source.incomingEmails[0].id }, data: { conversationId: target.id } });
    await tx.activityLog.updateMany({ where: { entityId: source.id, action: 'conversation.email_received' }, data: { entityId: target.id, userId: target.customerId } });
    await tx.notification.deleteMany({ where: { conversationId: source.id } });
    await tx.conversation.update({ where: { id: source.id }, data: { deletedAt: new Date() } });
    await tx.conversation.update({ where: { id: target.id }, data: { status: 'OPEN' } });
    await tx.activityLog.create({ data: { userId: target.customerId, entityId: target.id, action: 'conversation.email_reassigned', metadata: { reason: 'Gönderen adresine göre yanlış müşteri eşleştirmesi düzeltildi.', senderEmail: target.customer.email, sourceConversationId: source.id, previousAuthorId: source.messages[0].authorId, messageId: source.messages[0].id } } });
    await notifyConversation(tx, { id: target.customerId, name: target.customer.name, email: target.customer.email, role: 'CUSTOMER', departmentIds: [], sessionId: 'repair' }, target, 'EMAIL_RECEIVED', 'Yeni e-posta mesajı');
    return { movedMessageCount: 1, sourceNumber: source.number, targetNumber: target.number, customerName: target.customer.name };
  });
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
