import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import {
  saveSkillDefinition,
  deleteSkillDefinition,
  skillCatalog,
} from "../src/services/skill-catalog.service.js";
import { rankStaff } from "../src/services/skill-matching.js";
import type { Actor } from "../src/types/express.js";

test("skill catalog supports custom categories and levels, updates assignments and protects used definitions", async () => {
  const suffix = randomUUID().slice(0, 8),
    actor = {
      id: randomUUID(),
      name: "Catalog test",
      role: "ADMIN",
      departmentIds: [],
      sessionId: "test",
    } as Actor;
  const ids: string[] = [];
  let userId: string | undefined;
  try {
    const category = await saveSkillDefinition(actor, "category", {
      name: `Category ${suffix}`,
      rank: 1,
    });
    ids.push(category.id);
    const level = await saveSkillDefinition(actor, "level", {
      name: `Level ${suffix}`,
      rank: 7,
    });
    ids.push(level.id);
    const skill = await saveSkillDefinition(actor, "skill", {
      name: `Support ${suffix}`,
      categoryId: category.id,
      rank: 1,
    });
    ids.push(skill.id);
    await assert.rejects(
      saveSkillDefinition(actor, "category", {
        name: `category ${suffix}`,
        rank: 1,
      }),
      /zaten var/,
    );
    await assert.rejects(
      saveSkillDefinition(actor, "skill", {
        name: "Invalid",
        categoryId: randomUUID(),
        rank: 1,
      }),
      /kategori/,
    );
    await assert.rejects(
      deleteSkillDefinition(actor, category.id),
      /bağlı yetenek/,
    );
    const user = await db.user.create({
      data: {
        name: "Catalog test " + suffix,
        passwordHash: "test-only",
        role: "AGENT",
        skills: {
          create: {
            name: skill.name,
            category: category.name,
            level: level.name,
          },
        },
      },
    });
    userId = user.id;
    await assert.rejects(deleteSkillDefinition(actor, skill.id), /personelde/);
    await assert.rejects(deleteSkillDefinition(actor, level.id), /personelde/);
    await saveSkillDefinition(
      actor,
      "category",
      { name: `Renamed ${suffix}`, rank: 1 },
      category.id,
    );
    await saveSkillDefinition(
      actor,
      "level",
      { name: `Expert ${suffix}`, rank: 8 },
      level.id,
    );
    await saveSkillDefinition(
      actor,
      "skill",
      { name: `Service ${suffix}`, categoryId: category.id, rank: 1 },
      skill.id,
    );
    const assigned = await db.userSkill.findMany({ where: { userId } });
    assert.equal(assigned[0].category, `Renamed ${suffix}`);
    assert.equal(assigned[0].level, `Expert ${suffix}`);
    assert.equal(assigned[0].name, `Service ${suffix}`);
    assert.equal(
      rankStaff(
        `Service ${suffix}`,
        [{ id: user.id, name: user.name, skills: assigned }],
        { [`Expert ${suffix}`]: 8 },
      )[0].score,
      8,
    );
    assert.ok(
      (await skillCatalog(actor)).skills.some((item) => item.id === skill.id),
    );
    await assert.rejects(
      saveSkillDefinition(
        { ...actor, role: "AGENT", rolePermissions: [] },
        "category",
        { name: "Denied", rank: 1 },
      ),
      /yetkiniz/,
    );
  } finally {
    if (userId) await db.user.delete({ where: { id: userId } });
    for (const id of ids.reverse())
      await db.skillDefinition.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
