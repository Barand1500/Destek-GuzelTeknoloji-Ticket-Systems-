import "dotenv/config";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "../src/config/db.js";
const config = z
  .object({
    SEED_ADMIN_EMAIL: z.email(),
    SEED_ADMIN_PASSWORD: z.string().min(12).max(72),
    SEED_AGENT_EMAIL: z.email(),
    SEED_AGENT_PASSWORD: z.string().min(12).max(72),
  })
  .parse(process.env);
try {
  const department = await db.department.upsert({
    where: { name: "Teknik Destek" },
    create: { name: "Teknik Destek" },
    update: {},
  });
  await db.department.upsert({
    where: { name: "Muhasebe" },
    create: { name: "Muhasebe" },
    update: {},
  });
  await db.department.upsert({
    where: { name: "Genel Destek" },
    create: { name: "Genel Destek" },
    update: {},
  });
  await db.user.upsert({
    where: { loginEmail: config.SEED_ADMIN_EMAIL },
    update: { email: config.SEED_ADMIN_EMAIL },
    create: {
      name: "Sistem Yöneticisi",
      email: config.SEED_ADMIN_EMAIL,
      loginEmail: config.SEED_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(config.SEED_ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
  });
  const agent = await db.user.upsert({
    where: { loginEmail: config.SEED_AGENT_EMAIL },
    update: { email: config.SEED_AGENT_EMAIL },
    create: {
      name: "Destek Uzmanı",
      email: config.SEED_AGENT_EMAIL,
      loginEmail: config.SEED_AGENT_EMAIL,
      passwordHash: await bcrypt.hash(config.SEED_AGENT_PASSWORD, 12),
      role: "AGENT",
    },
  });
  await db.departmentAgent.upsert({
    where: {
      departmentId_userId: { departmentId: department.id, userId: agent.id },
    },
    update: {},
    create: { departmentId: department.id, userId: agent.id },
  });
  const statuses = [
    ["OPEN", "Açık", "#2f8f73"],
    ["PENDING", "Beklemede", "#d49a2a"],
    ["IN_PROGRESS", "İşlemde", "#3b82c4"],
    ["RESOLVED", "Çözüldü", "#398571"],
    ["CLOSED", "Kapalı", "#78848a"],
  ] as const;
  for (const [code, name, color] of statuses) await db.statusOption.upsert({ where: { code }, update: { name, color }, create: { code, name, color } });
  const priorities = [
    ["LOW", "Düşük", "#3b82c4"],
    ["NORMAL", "Normal", "#78848a"],
    ["HIGH", "Yüksek", "#dd7a2d"],
    ["URGENT", "Acil", "#c94b4b"],
  ] as const;
  for (const [code, name, color] of priorities) await db.priorityOption.upsert({ where: { code }, update: { name, color }, create: { code, name, color } });
  console.log(
    "Departmanlar ve geliştirme kullanıcıları hazır. Mevcut hesapların şifreleri değiştirilmedi.",
  );
} finally {
  await db.$disconnect();
}
