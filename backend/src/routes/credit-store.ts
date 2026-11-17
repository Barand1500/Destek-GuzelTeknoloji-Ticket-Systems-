import rateLimit from "express-rate-limit";
import * as orders from "../services/credit-orders.service.js";
import * as periods from "../services/credit-periods.service.js";
import * as checkout from '../services/credit-checkout.service.js';
import { Router } from "express";
import { idSchema } from "../validators/index.js";
import {
  salesSettingsInput,
  salesPlanInput,
  quoteInput,
} from "../services/credit-store-pricing.js";
import * as service from "../services/credit-store.service.js";
import * as binSearch from "../services/bin-search.service.js";
export const creditStoreRouter = Router();
creditStoreRouter.use(
  ["/credit-sales", "/my/credit-store"],
  (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
);
creditStoreRouter.get("/credit-sales/periods", async (req, res) =>
  res.json({ success: true, data: await periods.listCreditPeriods(req.actor) }),
);
creditStoreRouter.post("/credit-sales/periods", async (req, res) =>
  res.status(201).json({
    success: true,
    data: await periods.createCreditPeriod(req.actor, req.body),
  }),
);
creditStoreRouter.delete("/credit-sales/periods/:id", async (req, res) => {
  await periods.archiveCreditPeriod(req.actor, idSchema.parse(req.params.id));
  res.json({ success: true });
});
creditStoreRouter.get("/credit-sales", async (req, res) =>
  res.json({ success: true, data: await service.salesAdminCatalog(req.actor) }),
);
creditStoreRouter.get("/credit-sales/bin-search", async (req, res) =>
  res.json({ success: true, ...(await binSearch.searchBinRecords(req.actor, req.query)) }),
);
creditStoreRouter.put("/credit-sales/settings", async (req, res) =>
  res.json({
    success: true,
    data: await service.saveSalesSettings(
      req.actor,
      salesSettingsInput.parse(req.body),
    ),
  }),
);
creditStoreRouter.post("/credit-sales/plans", async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.saveSalesPlan(
      req.actor,
      null,
      salesPlanInput.parse(req.body),
    ),
  }),
);
creditStoreRouter.put("/credit-sales/plans/:id", async (req, res) =>
  res.json({
    success: true,
    data: await service.saveSalesPlan(
      req.actor,
      idSchema.parse(req.params.id),
      salesPlanInput.parse(req.body),
    ),
  }),
);
creditStoreRouter.get("/my/credit-store", async (req, res) =>
  res.json({ success: true, data: await service.storeCatalog(req.actor) }),
);
creditStoreRouter.post("/my/credit-store/quote", async (req, res) =>
  res.json({
    success: true,
    data: await service.storeQuote(req.actor, quoteInput.parse(req.body)),
  }),
);

const orderLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.actor.id,
  message: {
    success: false,
    error: {
      code: "ORDER_RATE_LIMITED",
      message: "Çok fazla sipariş isteği. Lütfen daha sonra tekrar deneyin.",
    },
  },
});
const binLimiter=rateLimit({windowMs:60000,limit:20,keyGenerator:req=>req.actor.id,standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,error:{code:'BIN_RATE_LIMITED',message:'Çok fazla kart sorgusu. Lütfen bir dakika sonra tekrar deneyin.'}}});
creditStoreRouter.post('/my/credit-store/card-info',binLimiter,async(req,res)=>res.json({success:true,data:await checkout.customerCardInfo(req.actor,req.body)}));
creditStoreRouter.get('/my/credit-store/orders/:id/checkout',async(req,res)=>res.json({success:true,data:await checkout.customerCheckout(req.actor,idSchema.parse(req.params.id))}));
creditStoreRouter.get("/my/credit-store/orders", async (req, res) =>
  res.json({
    success: true,
    ...(await orders.listCreditOrders(
      req.actor,
      orders.creditOrderListInput.parse(req.query),
    )),
  }),
);
creditStoreRouter.post(
  "/my/credit-store/orders",
  orderLimiter,
  async (req, res) =>
    res.status(201).json({
      success: true,
      data: await orders.createCreditOrder(
        req.actor,
        orders.createCreditOrderInput.parse(req.body),
      ),
    }),
);
creditStoreRouter.post("/my/credit-store/orders/:id/cancel", async (req, res) =>
  res.json({
    success: true,
    data: await orders.cancelCreditOrder(
      req.actor,
      idSchema.parse(req.params.id),
    ),
  }),
);
creditStoreRouter.get("/credit-sales/orders", async (req, res) =>
  res.json({
    success: true,
    ...(await orders.listCreditOrders(
      req.actor,
      orders.creditOrderListInput.parse(req.query),
      true,
    )),
  }),
);
creditStoreRouter.post("/credit-sales/orders/:id/cancel", async (req, res) =>
  res.json({
    success: true,
    data: await orders.cancelCreditOrder(
      req.actor,
      idSchema.parse(req.params.id),
      true,
    ),
  }),
);
