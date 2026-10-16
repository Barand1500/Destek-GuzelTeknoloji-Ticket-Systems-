import { z } from "zod";
import { db } from "../config/db.js";
import { can } from "./permissions.js";
import { skillKey } from "./skill-matching.js";
import { publishChange } from "./events.service.js";
import { AppError } from "../utils/errors.js";
import type { Actor } from "../types/express.js";

export const skillKind = z.enum(["category", "level", "skill"]);
export const skillDefinitionInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    categoryId: z.uuid().nullable().optional(),
    rank: z.number().int().min(1).max(10).default(1),
  })
  .strict();
function authorize(actor: Actor, action: string) {
  if (actor.role === "CUSTOMER" || !can(actor, `skills.${action}`))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Yetenek tanımlarını yönetme yetkiniz yok.",
    );
}
export async function skillCatalog(actor: Actor) {
  if (
    actor.role === "CUSTOMER" ||
    ![
      "skills.view",
      "users.view",
      "users.create",
      "users.update",
      "conversations.assign",
    ].some((key) => can(actor, key))
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Yetenekleri görüntüleme yetkiniz yok.",
    );
  const all = await db.skillDefinition.findMany({
    orderBy: [{ rank: "asc" }, { name: "asc" }],
  });
  return {
    categories: all.filter((item) => item.kind === "category"),
    levels: all.filter((item) => item.kind === "level"),
    skills: all.filter((item) => item.kind === "skill"),
  };
}
export async function saveSkillDefinition(
  actor: Actor,
  kind: z.infer<typeof skillKind>,
  input: z.infer<typeof skillDefinitionInput>,
  id?: string,
) {
  authorize(actor, id ? "update" : "create");
  if (
    input.name.length > (kind === "category" ? 60 : kind === "level" ? 20 : 80)
  )
    throw new AppError(
      400,
      "INVALID_NAME",
      "Kategori en fazla 60, seviye en fazla 20 karakter olmalıdır.",
    );
  try {
    const result = await db.$transaction(
      async (tx) => {
        const current = id
          ? await tx.skillDefinition.findUnique({ where: { id } })
          : null;
        if (id && (!current || current.kind !== kind))
          throw new AppError(404, "NOT_FOUND", "Yetenek tanımı bulunamadı.");
        const categoryId =
          kind === "skill"
            ? (input.categoryId ?? current?.categoryId ?? null)
            : null;
        if (
          kind === "skill" &&
          (!categoryId ||
            !(await tx.skillDefinition.findFirst({
              where: { id: categoryId, kind: "category" },
            })))
        )
          throw new AppError(
            400,
            "INVALID_CATEGORY",
            "Önce bir yetenek kategorisi seçin.",
          );
        const data = {
          kind,
          name: input.name,
          normalizedKey: skillKey(input.name),
          categoryId,
          rank: input.rank,
        };
        const saved = current
          ? await tx.skillDefinition.update({ where: { id }, data })
          : await tx.skillDefinition.create({ data });
        if (current) {
          if (kind === "category")
            await tx.userSkill.updateMany({
              where: { category: current.name },
              data: { category: saved.name },
            });
          if (kind === "level")
            await tx.userSkill.updateMany({
              where: { level: current.name },
              data: { level: saved.name },
            });
          if (kind === "skill") {
            const category = await tx.skillDefinition.findUniqueOrThrow({
              where: { id: categoryId! },
            });
            await tx.userSkill.updateMany({
              where: { name: current.name },
              data: { name: saved.name, category: category.name },
            });
          }
        }
        return saved;
      },
      { isolationLevel: "Serializable" },
    );
    publishChange();
    return result;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new AppError(
        409,
        "DUPLICATE_SKILL",
        "Bu adla bir tanım zaten var.",
      );
    throw error;
  }
}
export async function deleteSkillDefinition(actor: Actor, id: string) {
  authorize(actor, "delete");
  await db.$transaction(
    async (tx) => {
      const item = await tx.skillDefinition.findUnique({ where: { id } });
      if (!item)
        throw new AppError(404, "NOT_FOUND", "Yetenek tanımı bulunamadı.");
      if (await tx.skillDefinition.count({ where: { categoryId: id } }))
        throw new AppError(
          409,
          "SKILL_IN_USE",
          "Kategoriye bağlı yetenekleri önce taşıyın veya silin.",
        );
      const where =
        item.kind === "category"
          ? { category: item.name }
          : item.kind === "level"
            ? { level: item.name }
            : { name: item.name };
      if (await tx.userSkill.count({ where }))
        throw new AppError(
          409,
          "SKILL_IN_USE",
          "Bu tanım personelde kullanılıyor. Önce personelin yeteneklerini güncelleyin.",
        );
      await tx.skillDefinition.delete({ where: { id } });
    },
    { isolationLevel: "Serializable" },
  );
  publishChange();
}
