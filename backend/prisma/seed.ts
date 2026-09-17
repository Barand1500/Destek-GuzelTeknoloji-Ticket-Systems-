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
    where: { email: config.SEED_ADMIN_EMAIL },
    update: {},
    create: {
      name: "Sistem Yöneticisi",
      email: config.SEED_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(config.SEED_ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
  });
  const agent = await db.user.upsert({
    where: { email: config.SEED_AGENT_EMAIL },
    update: {},
    create: {
      name: "Destek Uzmanı",
      email: config.SEED_AGENT_EMAIL,
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
  console.log(
    "Departmanlar ve geliştirme kullanıcıları hazır. Mevcut hesapların şifreleri değiştirilmedi.",
  );
} finally {
  await db.$disconnect();
}
