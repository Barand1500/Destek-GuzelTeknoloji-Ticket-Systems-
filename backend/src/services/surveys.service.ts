import type { z } from "zod";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import type { createSurveySchema, surveyAnswersSchema } from "../validators/surveys.js";
import { announcementDirectory } from "./announcements.service.js";
import { publishChange } from "./events.service.js";
import { sendChannelReply } from "./integrations.service.js";
import { queueSupportEmail } from "./mailer.service.js";

const include = { recipients: true, responses: true } as const;

function publicSurvey(row: any, actor: Actor) {
  const answered = row.responses.some((item: any) => item.userId === actor.id);
  const admin = actor.role === "ADMIN";
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    anonymous: row.anonymous,
    endsAt: row.endsAt,
    questions: row.questions,
    channels: row.channels,
    authorName: row.authorName,
    createdAt: row.createdAt,
    active: !row.closedAt && row.endsAt > new Date(),
    closedAt: row.closedAt,
    answered,
    participantCount: admin ? row.responses.length : undefined,
    recipientCount: admin ? row.recipients.length : undefined,
    responses: admin ? row.responses.map((response: any) => ({ ...response, respondentName: row.anonymous ? null : response.respondentName })) : undefined,
  };
}

export async function listSurveys(actor: Actor) {
  const rows = await db.survey.findMany({
    where: actor.role === "ADMIN" ? {} : { recipients: { some: { userId: actor.id } } },
    include,
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((row) => publicSurvey(row, actor));
}

export async function createSurvey(actor: Actor, input: z.infer<typeof createSurveySchema>) {
  if (actor.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Anketi yalnızca yöneticiler oluşturabilir.");
  const directory = await announcementDirectory(actor);
  const scope = directory.people.filter((person) => !input.departmentId || person.departmentIds.includes(input.departmentId));
  const ids = new Set(input.recipientIds);
  const recipients = input.recipientMode === "SELECTED" ? scope.filter((person) => ids.has(person.id)) : scope;
  if (!recipients.length) throw new AppError(400, "NO_RECIPIENTS", "Anket için en az bir alıcı seçin.");
  if (input.channels.includes("SMS") && !directory.smsEnabled) throw new AppError(400, "SMS_NOT_CONFIGURED", "SMS entegrasyonu etkin değil.");
  if (input.channels.includes("EMAIL") && !directory.emailEnabled) throw new AppError(400, "EMAIL_NOT_CONFIGURED", "E-posta entegrasyonu etkin değil.");
  const endsAt = new Date(Date.now() + input.durationDays * 86400000);
  const row = await db.survey.create({
    data: {
      authorId: actor.id, authorName: actor.name, title: input.title, description: input.description,
      anonymous: input.anonymous, endsAt, questions: input.questions, channels: input.channels,
      recipients: { create: recipients.map((person) => ({ userId: person.id, recipientName: person.name, deliveryStatus: Object.fromEntries(input.channels.map((channel) => [channel, channel === "NOTIFICATION" ? "SENT" : "QUEUED"])) })) },
    }, include,
  });
  const surveyUrl = `${env.FRONTEND_URL}/agent/surveys`;
  for (const person of recipients) {
    if (input.channels.includes("NOTIFICATION")) await db.notification.create({ data: { userId: person.id, type: "SURVEY", title: `Yeni anket: ${input.title}`, message: `${input.description || "Katılımınızı bekleyen yeni bir anket var."} Son tarih: ${endsAt.toLocaleDateString("tr-TR")}`.slice(0, 180) } });
    if (input.channels.includes("EMAIL") && person.email) queueSupportEmail(person.email, `Yeni anket: ${input.title}`, `${input.description}\n\nAnketi yanıtla: ${surveyUrl}`, "Anket bildirimi");
    if (input.channels.includes("SMS") && person.phone) void sendChannelReply("SMS", { phone: person.phone }, `${input.title}: ${input.description} ${surveyUrl}`).catch(() => undefined);
  }
  await db.activityLog.create({ data: { userId: actor.id, action: "survey.created", entityType: "Survey", entityId: row.id, metadata: { recipientCount: recipients.length, channels: input.channels }, ipAddress: actor.ipAddress } });
  publishChange();
  return publicSurvey(row, actor);
}

export async function respond(actor: Actor, id: string, input: z.infer<typeof surveyAnswersSchema>) {
  const survey = await db.survey.findFirst({ where: { id, ...(actor.role === "ADMIN" ? {} : { recipients: { some: { userId: actor.id } } }) } });
  if (!survey) throw new AppError(404, "NOT_FOUND", "Anket bulunamadı.");
  if (survey.closedAt || survey.endsAt <= new Date()) throw new AppError(409, "SURVEY_ENDED", "Bu anket sona erdi.");
  const questions = survey.questions as Array<{ id: string; type: string; options?: string[]; condition?: { questionId: string; option: string } | null }>;
  const answers: Record<string, string | string[] | number> = {};
  for (const question of questions) {
    if (question.condition) {
      const source = answers[question.condition.questionId];
      if (Array.isArray(source) ? !source.includes(question.condition.option) : source !== question.condition.option) continue;
    }
    let value = input.answers[question.id];
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) throw new AppError(400, "MISSING_ANSWER", "Gösterilen tüm soruları yanıtlayın.");
    if (question.type === "YES_NO" && typeof value === "boolean") value = value ? "Evet" : "Hayır";
    const options = question.type === "YES_NO" ? ["Evet", "Hayır"] : question.options ?? [];
    const valid = question.type === "TEXT" ? typeof value === "string" && Boolean(value.trim())
      : question.type === "RATING" ? typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
      : question.type === "MULTIPLE" ? Array.isArray(value) && value.every(option => options.includes(option)) && new Set(value).size === value.length
      : typeof value === "string" && options.includes(value);
    if (!valid) throw new AppError(400, "INVALID_ANSWER", "Yanıt, sorunun türüne ve seçeneklerine uygun olmalıdır.");
    answers[question.id] = typeof value === "string" ? value.trim() : value as string[] | number;
  }
  try {
    await db.surveyResponse.create({ data: { surveyId: id, userId: actor.id, respondentName: survey.anonymous ? null : actor.name, answers } });
  } catch (error: any) {
    if (error?.code === "P2002") throw new AppError(409, "ALREADY_ANSWERED", "Bu anketi daha önce yanıtladınız.");
    throw error;
  }
  publishChange();
  return { submitted: true };
}

export async function removeSurvey(actor: Actor, id: string) {
  if (actor.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Yetkiniz yok.");
  await db.survey.delete({ where: { id } }).catch(() => { throw new AppError(404, "NOT_FOUND", "Anket bulunamadı."); });
  publishChange();
}

export async function closeSurvey(actor: Actor, id: string) {
  if (actor.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Yetkiniz yok.");
  const survey = await db.survey.findUnique({ where: { id } });
  if (!survey) throw new AppError(404, "NOT_FOUND", "Anket bulunamadı.");
  if (!survey.closedAt) {
    await db.$transaction([
      db.survey.update({ where: { id }, data: { closedAt: new Date() } }),
      db.activityLog.create({ data: { userId: actor.id, action: "survey.closed", entityType: "Survey", entityId: id, ipAddress: actor.ipAddress } }),
    ]);
    publishChange();
  }
}
