import "dotenv/config";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { db } from "../src/config/db.js";
import { uploadRoot } from "../src/services/uploads.service.js";

const root = path.resolve(process.cwd(), "..");
const sources = [
  { aliases: ["etic7", "etic 7"], fileName: "etic7-proje-detay.pdf" },
  { aliases: ["anypay", "any pay"], fileName: "anypay - proje bilgi formu.pdf" },
];
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, " ").trim();

try {
  const admin = await db.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) throw new Error("Aktif yönetici hesabı bulunamadı.");
  const projects = await db.website.findMany({ select: { id: true, name: true } });
  await mkdir(uploadRoot, { recursive: true });
  for (const source of sources) {
    const project = projects.find(item => source.aliases.includes(normalize(item.name).replaceAll(" ", "")) || source.aliases.includes(normalize(item.name)));
    if (!project) { console.warn(`${source.fileName}: eşleşen proje bulunamadı.`); continue; }
    const existing = await db.projectGuideFile.findFirst({ where: { websiteId: project.id, originalName: source.fileName } });
    if (existing) { console.log(`${project.name}: belge zaten bağlı.`); continue; }
    const sourcePath = path.join(root, "Pdf", source.fileName);
    const info = await stat(sourcePath);
    const storageKey = randomUUID();
    const targetPath = path.join(uploadRoot, storageKey);
    await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
    try {
      await db.projectGuideFile.create({ data: { websiteId: project.id, uploaderId: admin.id, originalName: source.fileName, mimeType: "application/pdf", size: info.size, storageKey } });
      console.log(`${project.name}: ${source.fileName} bağlandı.`);
    } catch (error) {
      await unlink(targetPath).catch(() => undefined);
      throw error;
    }
  }
} finally {
  await db.$disconnect();
}
