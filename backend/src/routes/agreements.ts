import { Router } from 'express';
import { z } from 'zod';
import { idSchema } from '../validators/index.js';
import * as service from '../services/agreements.service.js';
import { getConversation } from '../services/conversations.service.js';
import { db } from '../config/db.js';
import { AppError } from '../utils/errors.js';
export const agreementsRouter = Router();
agreementsRouter.get('/customers/:id/relations', async (req, res) => res.json({ success: true, data: await service.listCustomerRelations(req.actor, idSchema.parse(req.params.id)) }));
agreementsRouter.post('/customers/:id/relations', async (req, res) => res.status(201).json({ success: true, data: await service.createRelatedCustomer(req.actor, idSchema.parse(req.params.id), service.relatedCustomerInput.parse(req.body)) }));
agreementsRouter.get('/customers/:id/agreements', async (req, res) => res.json({ success: true, data: await service.listAgreements(req.actor, idSchema.parse(req.params.id)) }));
agreementsRouter.post('/customers/:id/agreements', async (req, res) => res.status(201).json({ success: true, data: await service.createAgreement(req.actor, idSchema.parse(req.params.id), service.agreementInput.parse(req.body)) }));
agreementsRouter.post('/customers/:id/agreements/:agreementId/cancel', async (req, res) => { await service.cancelAgreement(req.actor, idSchema.parse(req.params.id), idSchema.parse(req.params.agreementId)); res.json({ success: true }); });
agreementsRouter.put('/customers/:id/parent', async (req, res) => { await service.setCustomerParent(req.actor, idSchema.parse(req.params.id), z.object({ parentCustomerId: z.uuid().nullable() }).strict().parse(req.body).parentCustomerId); res.json({ success: true }); });
agreementsRouter.put('/customers/:id/credit-sharing', async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
  await service.setCompanyCreditSharing(req.actor, idSchema.parse(req.params.id), enabled);
  res.json({ success: true });
});
agreementsRouter.get('/my/agreements', async (req, res) => {
  if (req.actor.role !== 'CUSTOMER') throw new AppError(403, 'FORBIDDEN', 'Bu ekran müşteriler içindir.');
  res.json({ success: true, data: await service.listAgreements(req.actor, req.actor.id) });
});
agreementsRouter.get('/conversations/:id/credit-options', async (req, res) => {
  const conversation = await getConversation(req.actor, idSchema.parse(req.params.id));
  if (req.actor.role === 'CUSTOMER') throw new AppError(403, 'FORBIDDEN', 'Bu işlem personel içindir.');
  const data = await service.listAgreements(req.actor, conversation.customerId);
  res.json({ success: true, data: { agreements: data.agreements.filter(a => a.usable), charge: await db.creditCharge.findUnique({ where: { conversationId: conversation.id } }) } });
});
