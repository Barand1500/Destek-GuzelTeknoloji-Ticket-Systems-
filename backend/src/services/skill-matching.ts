export type StaffSkill = { name: string; category: string; level: string };
export const skillKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ş/g, "s")
    .replace(/\s+/g, " ");
const aliases: Record<string, string[]> = {
  react: ["react.js", "reactjs"],
  "vue.js": ["vue", "vuejs"],
  "next.js": ["nextjs"],
  "node.js": ["nodejs", "node"],
  "tailwind css": ["tailwind"],
  ingilizce: ["english"],
  almanca: ["german", "deutsch"],
  fransizca: ["french"],
  ispanyolca: ["spanish"],
  arapca: ["arabic"],
  turkce: ["turkish"],
  rusca: ["russian"],
  cince: ["chinese"],
  japonca: ["japanese"],
  "c#": ["csharp", "c sharp"],
  "c++": ["cpp"],
};
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function matchSkills(text: string, skills: StaffSkill[]) {
  const normalized = skillKey(text);
  return skills.filter((skill) => {
    const name = skillKey(skill.name);
    const variants = new Set([name, ...(aliases[name] ?? [])]);
    for (const [canonical, alternatives] of Object.entries(aliases)) {
      if (alternatives.includes(name)) {
        variants.add(canonical);
        alternatives.forEach((value) => variants.add(value));
      }
    }
    return [...variants].some((value) =>
      new RegExp(
        `(?<![a-z0-9_+#])${escapeRegex(value)}(?![a-z0-9_+#])`,
        "u",
      ).test(normalized),
    );
  });
}
const levels: Record<string, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  EXPERT: 4,
};
export function rankStaff<
  T extends { id: string; name: string; skills: StaffSkill[] },
>(text: string, staff: T[]) {
  return staff
    .map((person) => {
      const matches = matchSkills(text, person.skills);
      return {
        ...person,
        matches,
        score: matches.reduce(
          (total, skill) => total + (levels[skill.level] ?? 0),
          0,
        ),
      };
    })
    .filter((person) => person.matches.length > 0)
    .sort(
      (a, b) =>
        b.matches.length - a.matches.length ||
        b.score - a.score ||
        a.name.localeCompare(b.name, "tr") ||
        a.id.localeCompare(b.id),
    );
}
