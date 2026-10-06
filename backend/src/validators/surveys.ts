import { z } from "zod";

const condition = z.object({ questionId: z.string().min(1).max(50), option: z.string().trim().min(1).max(200) }).strict().nullable().optional();
const questionFields = { id: z.string().min(1).max(50), text: z.string().trim().min(2).max(500), condition };
const question = z.discriminatedUnion("type", [
  z.object({ ...questionFields, type: z.literal("SINGLE"), options: z.array(z.string().trim().min(1).max(200)).min(2).max(20) }),
  z.object({ ...questionFields, type: z.literal("MULTIPLE"), options: z.array(z.string().trim().min(1).max(200)).min(2).max(20) }),
  z.object({ ...questionFields, type: z.literal("TEXT") }),
  z.object({ ...questionFields, type: z.literal("RATING") }),
  z.object({ ...questionFields, type: z.literal("YES_NO") }),
]);

export const createSurveySchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).default(""),
  durationDays: z.number().int().min(1).max(365),
  anonymous: z.boolean(),
  questions: z.array(question).min(1).max(30),
  departmentId: z.uuid().nullable(),
  recipientMode: z.enum(["ALL", "SELECTED"]),
  recipientIds: z.array(z.uuid()).max(2000),
  channels: z.array(z.enum(["NOTIFICATION", "SMS", "EMAIL"])).min(1).max(3),
}).strict().superRefine((survey, context) => {
  const previous = new Map<string, (typeof survey.questions)[number]>();
  survey.questions.forEach((question, index) => {
    if (previous.has(question.id)) context.addIssue({ code: "custom", path: ["questions", index, "id"], message: "Soru kimlikleri farklı olmalıdır." });
    if (question.condition) {
      const source = previous.get(question.condition.questionId);
      const options = source?.type === "YES_NO" ? ["Evet", "Hayır"] : source?.type === "SINGLE" || source?.type === "MULTIPLE" ? source.options : [];
      if (!source || !options?.includes(question.condition.option)) context.addIssue({ code: "custom", path: ["questions", index, "condition"], message: "Koşul, önceki sorulardan birinin geçerli seçeneğine bağlı olmalıdır." });
    }
    if ((question.type === "SINGLE" || question.type === "MULTIPLE") && new Set(question.options).size !== question.options.length) context.addIssue({ code: "custom", path: ["questions", index, "options"], message: "Seçenekler birbirinden farklı olmalıdır." });
    previous.set(question.id, question);
  });
});

export const surveyAnswersSchema = z.object({
  answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(500)).max(20), z.number().int().min(1).max(5), z.boolean()])),
}).strict();
