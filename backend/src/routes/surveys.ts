import { Router } from "express";
import { authorize } from "../middleware/auth.js";
import { idSchema } from "../validators/index.js";
import { createSurveySchema, surveyAnswersSchema } from "../validators/surveys.js";
import * as service from "../services/surveys.service.js";

export const surveysRouter = Router();
surveysRouter.use(authorize("ADMIN", "SUPERVISOR", "AGENT"));
surveysRouter.get("/", async (req, res) => res.json({ success: true, data: await service.listSurveys(req.actor) }));
surveysRouter.get("/directory", async (req, res) => {
  const { announcementDirectory } = await import("../services/announcements.service.js");
  res.json({ success: true, data: await announcementDirectory(req.actor) });
});
surveysRouter.post("/", async (req, res) => res.status(201).json({ success: true, data: await service.createSurvey(req.actor, createSurveySchema.parse(req.body)) }));
surveysRouter.post("/:id/responses", async (req, res) => res.status(201).json({ success: true, data: await service.respond(req.actor, idSchema.parse(req.params.id), surveyAnswersSchema.parse(req.body)) }));
surveysRouter.post("/:id/close", async (req, res) => { await service.closeSurvey(req.actor, idSchema.parse(req.params.id)); res.json({ success: true, data: null }); });
surveysRouter.delete("/:id", async (req, res) => { await service.removeSurvey(req.actor, idSchema.parse(req.params.id)); res.json({ success: true, data: null }); });
