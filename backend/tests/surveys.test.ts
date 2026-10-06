import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSurveySchema, surveyAnswersSchema } from "../src/validators/surveys.js";
import type { Actor } from "../src/types/express.js";

process.env.NODE_ENV = "test";
const { db } = await import("../src/config/db.js");
const service = await import("../src/services/surveys.service.js");

const questions = [
  { id: "join", type: "SINGLE", text: "Katılacak mısınız?", options: ["Evet", "Hayır"] },
  { id: "food", type: "MULTIPLE", text: "Ne yemek istersiniz?", options: ["Adana", "Balık"], condition: { questionId: "join", option: "Evet" } },
  { id: "detail", type: "TEXT", text: "Balık tercihinizi açıklayın", condition: { questionId: "food", option: "Balık" } },
  { id: "note", type: "TEXT", text: "Son notunuz nedir?" },
];
const payload = { title: "Koşullu anket", durationDays: 7, anonymous: false, questions, departmentId: null, recipientMode: "SELECTED", recipientIds: [randomUUID()], channels: ["NOTIFICATION"] };

test("survey conditions accept earlier choice questions and reject invalid references", () => {
  assert.equal(createSurveySchema.safeParse(payload).success, true);
  for (const condition of [{ questionId: "food", option: "Adana" }, { questionId: "missing", option: "Evet" }, { questionId: "join", option: "Bilinmeyen" }]) {
    assert.equal(createSurveySchema.safeParse({ ...payload, questions: [questions[0], { ...questions[1], condition }, ...questions.slice(2)] }).success, false);
  }
  assert.equal(createSurveySchema.safeParse({ ...payload, questions: [questions[0], { ...questions[1], id: "join" }] }).success, false);
  assert.equal(createSurveySchema.safeParse({ ...payload, questions: [{ ...questions[0], options: ["Evet", " Evet "] }] }).success, false);
  assert.equal(createSurveySchema.safeParse({ ...payload, questions: questions.map(({ condition, ...question }) => question) }).success, true);
});

test("survey responses validate visible branches, omit hidden answers, and retain written responses with privacy", async (t) => {
  const users: string[] = [], surveys: string[] = [];
  async function user(role: "ADMIN" | "AGENT"): Promise<Actor> {
    const row = await db.user.create({ data: { name: `Survey ${role}`, email: `survey-${randomUUID()}@example.test`, role, passwordHash: "unused-test-password" } });
    users.push(row.id);
    return { id: row.id, name: row.name, email: row.email!, role, departmentIds: [], sessionId: randomUUID() };
  }
  try {
    const admin = await user("ADMIN");
    const agent = await user("AGENT");
    async function create(anonymous = false, surveyQuestions = questions) {
      const row = await service.createSurvey(admin, createSurveySchema.parse({ ...payload, questions: surveyQuestions, anonymous, recipientIds: [agent.id] }));
      surveys.push(row.id);
      return row.id;
    }
    await t.test("missing and invalid answers cannot bypass an active branch", async () => {
      const id = await create();
      await assert.rejects(service.respond(agent, id, surveyAnswersSchema.parse({ answers: { join: "Evet", note: "Not" } })), { code: "MISSING_ANSWER" });
      await assert.rejects(service.respond(agent, id, surveyAnswersSchema.parse({ answers: { join: "Bilinmeyen", note: "Not" } })), { code: "INVALID_ANSWER" });
      await assert.rejects(service.respond(agent, id, surveyAnswersSchema.parse({ answers: { join: "Evet", food: ["Balık"], note: "Not" } })), { code: "MISSING_ANSWER" });
      assert.equal(await db.surveyResponse.count({ where: { surveyId: id } }), 0);
    });
    await t.test("a hidden parent hides its descendants and discards stale answers", async () => {
      const id = await create();
      await service.respond(agent, id, surveyAnswersSchema.parse({ answers: { join: "Hayır", food: ["Balık"], detail: "Gizlenmiş yanıt", note: "Katılmıyorum" } }));
      assert.deepEqual((await db.surveyResponse.findFirstOrThrow({ where: { surveyId: id } })).answers, { join: "Hayır", note: "Katılmıyorum" });
      await assert.rejects(service.respond(agent, id, surveyAnswersSchema.parse({ answers: { join: "Hayır", note: "Tekrar" } })), { code: "ALREADY_ANSWERED" });
    });
    await t.test("multi-selection conditions and written responses persist", async () => {
      const id = await create();
      const answers = { join: "Evet", food: ["Adana", "Balık"], detail: "Izgara balık\nSalata da olsun", note: "Teşekkürler" };
      await service.respond(agent, id, surveyAnswersSchema.parse({ answers }));
      assert.deepEqual((await db.surveyResponse.findFirstOrThrow({ where: { surveyId: id } })).answers, answers);
      const visible = (await service.listSurveys(admin)).find(survey => survey.id === id)!;
      assert.equal(visible.responses![0].respondentName, agent.name);
      assert.equal(visible.responses![0].answers.detail, answers.detail);
      assert.equal((await service.listSurveys(agent)).find(survey => survey.id === id)!.responses, undefined);
    });
    await t.test("anonymous written responses do not expose respondent names", async () => {
      const id = await create(true);
      await service.respond(agent, id, surveyAnswersSchema.parse({ answers: { join: "Hayır", note: "Anonim not" } }));
      const row = (await service.listSurveys(admin)).find(survey => survey.id === id)!;
      assert.equal(row.responses![0].respondentName, null);
      assert.equal(row.responses![0].answers.note, "Anonim not");
    });
  } finally {
    await db.survey.deleteMany({ where: { id: { in: surveys } } });
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.activityLog.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
