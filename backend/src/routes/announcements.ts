import { Router } from "express";
import { z } from "zod";
import path from "node:path";
import { authorize } from "../middleware/auth.js";
import { idSchema, paginationSchema } from "../validators/index.js";
import { announcementSchema } from "../validators/announcements.js";
import { AppError } from "../utils/errors.js";
import {
  announcementUpload,
  uploadRoot,
  withStoredUploads,
} from "../services/uploads.service.js";
import * as service from "../services/announcements.service.js";

export const announcementsRouter = Router();
announcementsRouter.use(authorize("ADMIN", "SUPERVISOR", "AGENT"));
announcementsRouter.get(
  "/directory",
  authorize("ADMIN", "SUPERVISOR"),
  async (req, res) =>
    res.json({
      success: true,
      data: await service.announcementDirectory(req.actor),
    }),
);
announcementsRouter.get("/", async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query);
  res.json({
    success: true,
    ...(await service.listAnnouncements(req.actor, page, limit, z.string().max(200).default("").parse(req.query.search))),
  });
});
announcementsRouter.post(
  "/",
  authorize("ADMIN", "SUPERVISOR"),
  announcementUpload,
  async (req, res) => {
    let payload: unknown;
    try {
      payload = JSON.parse(z.string().parse(req.body.payload));
    } catch {
      throw new AppError(400, "INVALID_PAYLOAD", "Duyuru formu geçerli değil.");
    }
    const data = await withStoredUploads(
      req.files as Express.Multer.File[],
      (files) =>
        service.createAnnouncement(
          req.actor,
          announcementSchema.parse(payload),
          files,
        ),
    );
    res.status(201).json({ success: true, data });
  },
);
announcementsRouter.get("/:id/files/:index", async (req, res, next) => {
  const file = await service.announcementFile(
    req.actor,
    idSchema.parse(req.params.id),
    z.coerce.number().int().min(0).max(9).parse(req.params.index),
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.download(
    path.join(uploadRoot, file.storageKey),
    file.originalName,
    (error) => {
      if (error && !res.headersSent) next(error);
    },
  );
});
