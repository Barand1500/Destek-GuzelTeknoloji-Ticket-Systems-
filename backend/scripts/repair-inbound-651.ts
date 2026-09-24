import { db } from '../src/config/db.js';
import { notifyConversation } from '../src/services/events.service.js';

try {
  const repair652 = process.argv.includes('--652');
  const repair653 = process.argv.includes('--653');
  const sourceId = repair653 ? 'c3e643c3-82ac-4f38-9a13-3ff22bcbc0e7' : repair652 ? '43a695bc-de8f-41ab-bf87-242c99978dd6' : '0c12ba2e-8e65-4902-89e9-e8539ad4536b';
  const sourceNumber = repair653 ? 653 : repair652 ? 652 : 651;
  const uid = repair653 ? 197 : repair652 ? 195 : 193;
  const messageId = repair653 ? '37e4f48a-8bea-4267-beed-461bf57d876a' : repair652 ? '77db0903-b803-4ee9-8156-474da255a4c7' : 'fce86911-c333-4e07-aa77-d4493e3d535c';
  const result = await db.$transaction(async tx => {
    const source = await tx.conversation.findUniqueOrThrow({ where: { id: sourceId }, include: { messages: true, incomingEmails: true } });
    const target = await tx.conversation.findUniqueOrThrow({ where: { id: '0f980c84-03c5-4a80-bb6c-f9a5a9ce21d6' }, include: { customer: true } });
    if (source.deletedAt && source.messages.length === 0) return { alreadyRepaired: true };
    if (target.deletedAt || target.customer.email !== 'yunusdurgun22@gmail.com' || source.number !== sourceNumber || target.number !== 650 || source.messages.length !== 1 || source.incomingEmails.length !== 1 || source.incomingEmails[0].uid !== uid || source.messages[0].id !== messageId) throw new Error('Repair preconditions changed; nothing updated.');
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
