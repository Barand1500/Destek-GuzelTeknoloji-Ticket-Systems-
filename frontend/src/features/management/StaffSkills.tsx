import { useState } from "react";
import { Award, Plus, Search, X } from "lucide-react";
import { DropdownSelect } from "../../components/DropdownSelect";
import type { StaffSkill } from "../../types";
import "./staffSkills.css";

export const skillLevels: Record<StaffSkill["level"], string> = {
  BEGINNER: "Başlangıç",
  INTERMEDIATE: "Orta",
  ADVANCED: "İleri",
  EXPERT: "Uzman",
};
const catalog: Record<string, string[]> = {
  Frontend: [
    "React",
    "Vue.js",
    "Angular",
    "TypeScript",
    "JavaScript",
    "HTML",
    "CSS",
    "Tailwind CSS",
    "Next.js",
    "Svelte",
    "jQuery",
  ],
  Backend: [
    "Node.js",
    "Express",
    "NestJS",
    ".NET",
    "Django",
    "Flask",
    "Laravel",
    "Spring Boot",
    "PHP",
    "Python",
    "Java",
    "C#",
    "Go",
    "Ruby",
  ],
  "Programlama Dilleri": [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C#",
    "C++",
    "C",
    "Go",
    "Rust",
    "PHP",
    "Ruby",
    "Swift",
    "Kotlin",
  ],
  Veritabanı: [
    "MySQL",
    "PostgreSQL",
    "MongoDB",
    "Redis",
    "SQL Server",
    "SQLite",
    "Oracle",
  ],
  DevOps: [
    "Docker",
    "Kubernetes",
    "Linux",
    "AWS",
    "Azure",
    "Git",
    "CI/CD",
    "Nginx",
  ],
  Mobil: ["React Native", "Flutter", "Swift", "Kotlin", "Android", "iOS"],
  Tasarım: ["Figma", "UI/UX", "Photoshop", "Illustrator"],
  Diller: [
    "Türkçe",
    "İngilizce",
    "Almanca",
    "Fransızca",
    "İspanyolca",
    "Arapça",
    "Rusça",
    "Çince",
    "Japonca",
    "İtalyanca",
  ],
};
const key = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ş/g, "s")
    .replace(/\s+/g, " ");

export function StaffSkills({ initial = [] }: { initial?: StaffSkill[] }) {
  const [skills, setSkills] = useState(initial);
  const [category, setCategory] = useState("Frontend");
  const [customCategory, setCustomCategory] = useState("");
  const [level, setLevel] = useState<StaffSkill["level"]>("INTERMEDIATE");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState("");
  const selectedCategory =
    category === "__custom" ? customCategory.trim() : category;
  const [notice, setNotice] = useState("");
  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !selectedCategory) {
      setNotice("Yetenek adı ve kategori girin.");
      return;
    }
    if (skills.some((skill) => key(skill.name) === key(trimmed))) {
      setNotice("Bu yetenek veya dil zaten eklendi.");
      return;
    }
    if (skills.length >= 100) {
      setNotice("En fazla 100 yetenek ve dil ekleyebilirsiniz.");
      return;
    }
    setSkills([
      ...skills,
      { name: trimmed, category: selectedCategory, level },
    ]);
    setCustom("");
    setNotice("");
  }
  const categories = [
    ...new Set([
      ...Object.keys(catalog),
      ...skills.map((skill) => skill.category),
    ]),
  ];
  return (
    <section className="staff-skills" aria-label="Yetenekler ve diller">
      <input type="hidden" name="skills" value={JSON.stringify(skills)} />
      <div className="staff-skills-heading">
        <Award size={20} />
        <strong>Yetenekler &amp; Diller</strong>
        <small>{skills.length} yetenek</small>
      </div>
      {skills.length > 0 && (
        <div className="staff-skill-tags">
          {skills.map((skill) => (
            <div className="staff-skill-tag" key={skill.name}>
              <span title={skill.category}>{skill.name}</span>
              <select
                aria-label={`${skill.name} seviyesi`}
                value={skill.level}
                onChange={(event) =>
                  setSkills(
                    skills.map((item) =>
                      item.name === skill.name
                        ? {
                            ...item,
                            level: event.target.value as StaffSkill["level"],
                          }
                        : item,
                    ),
                  )
                }
              >
                {Object.entries(skillLevels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`${skill.name} kaldır`}
                onClick={() =>
                  setSkills(skills.filter((item) => item.name !== skill.name))
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="staff-skills-controls">
        <DropdownSelect
          label="Kategori"
          ariaLabel="Yetenek kategorisi"
          value={category}
          onChange={(value) => {
            setCategory(value);
            setSearch("");
          }}
          options={[
            ...categories.map((value) => ({ value, label: value })),
            { value: "__custom", label: "Özel kategori ekle" },
          ]}
        />
        <DropdownSelect
          label="Seviye"
          ariaLabel="Yetenek seviyesi"
          value={level}
          onChange={(value) => setLevel(value as StaffSkill["level"])}
          options={Object.entries(skillLevels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      {category === "__custom" && (
        <input
          aria-label="Özel kategori adı"
          maxLength={60}
          placeholder="Kategori adı…"
          value={customCategory}
          onChange={(event) => setCustomCategory(event.target.value)}
        />
      )}
      <div className="staff-skills-search">
        <Search size={16} />
        <input
          aria-label="Yetenek ve dil ara"
          placeholder={`${selectedCategory || "Yetenekler"} içinde ara…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="staff-skills-options">
        {(catalog[category] ?? [])
          .filter((name) => key(name).includes(key(search)))
          .map((name) => (
            <button
              type="button"
              key={name}
              disabled={
                skills.some((skill) => key(skill.name) === key(name)) ||
                skills.length >= 100
              }
              onClick={() => add(name)}
            >
              <Plus size={14} />
              {name}
            </button>
          ))}
      </div>
      <div className="staff-skills-custom">
        <input
          aria-label="Özel yetenek veya dil"
          maxLength={80}
          placeholder="Özel yetenek veya dil ekle…"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(custom);
            }
          }}
        />
        <button
          type="button"
          className="button secondary"
          onClick={() => add(custom)}
          disabled={!custom.trim() || !selectedCategory || skills.length >= 100}
        >
          Ekle
        </button>
      </div>
      {notice && <small role="status">{notice}</small>}
    </section>
  );
}
