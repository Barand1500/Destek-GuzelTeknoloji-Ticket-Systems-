import { useState } from "react";
import { Award, Plus, X } from "lucide-react";
import { DropdownSelect } from "../../components/DropdownSelect";
import { useSkillCatalog } from "./Skills";
import { errorText } from "../../services/api";
import type { StaffSkill } from "../../types";
import "./staffSkills.css";

// Display labels for existing assignments only; these are not catalog options.
export const skillLevels: Record<string, string> = {
  BEGINNER: "Başlangıç",
  INTERMEDIATE: "Orta",
  ADVANCED: "İleri",
  EXPERT: "Uzman",
};
export function StaffSkills({ initial = [] }: { initial?: StaffSkill[] }) {
  const catalog = useSkillCatalog();
  const [skills, setSkills] = useState(initial);
  const [categoryId, setCategoryId] = useState(""),
    [skillId, setSkillId] = useState(""),
    [level, setLevel] = useState("");
  const categories = catalog.data?.categories ?? [],
    levels = catalog.data?.levels ?? [];
  const available = (catalog.data?.skills ?? []).filter(
    (item) =>
      item.categoryId === categoryId &&
      !skills.some((skill) => skill.name === item.name),
  );
  function add() {
    const selected = available.find((item) => item.id === skillId),
      category = categories.find((item) => item.id === categoryId);
    if (
      !selected ||
      !category ||
      !levels.some((item) => item.name === level) ||
      skills.length >= 100
    )
      return;
    setSkills([
      ...skills,
      { name: selected.name, category: category.name, level },
    ]);
    setSkillId("");
  }
  return (
    <section className="staff-skills" aria-label="Personel Yetenekleri">
      <input type="hidden" name="skills" value={JSON.stringify(skills)} />
      <div className="staff-skills-heading">
        <Award size={20} />
        <strong>Yetenekler</strong>
        <small>{skills.length} yetenek</small>
      </div>
      {!!skills.length && (
        <div className="staff-skill-tags">
          {skills.map((skill) => (
            <div className="staff-skill-tag" key={skill.name}>
              <span title={skill.category}>{skill.name}</span>
              <DropdownSelect
                ariaLabel={`${skill.name} seviyesi`}
                value={skill.level}
                onChange={(level) =>
                  setSkills(
                    skills.map((item) =>
                      item.name === skill.name ? { ...item, level } : item,
                    ),
                  )
                }
                options={[
                  ...levels.map((item) => ({
                    value: item.name,
                    label: item.name,
                  })),
                  ...(!levels.some((item) => item.name === skill.level)
                    ? [
                        {
                          value: skill.level,
                          label: skillLevels[skill.level] ?? skill.level,
                        },
                      ]
                    : []),
                ]}
              />
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
          ariaLabel="Yetenek Kategorisi"
          value={categoryId}
          onChange={(value) => {
            setCategoryId(value);
            setSkillId("");
          }}
          options={[
            { value: "", label: "Kategori Seçin" },
            ...categories.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <DropdownSelect
          label="Yetenek"
          ariaLabel="Personel Yeteneği"
          value={skillId}
          onChange={setSkillId}
          options={[
            {
              value: "",
              label: categoryId ? "Yetenek Seçin" : "Önce Kategori Seçin",
            },
            ...available.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
      </div>
      <DropdownSelect
        label="Seviye"
        ariaLabel="Yetenek Seviyesi"
        value={level}
        onChange={setLevel}
        options={[
          { value: "", label: "Seviye Seçin" },
          ...levels.map((item) => ({ value: item.name, label: item.name })),
        ]}
      />
      <button
        type="button"
        className="button secondary"
        onClick={add}
        disabled={
          !skillId ||
          !level ||
          !levels.some((item) => item.name === level) ||
          skills.length >= 100
        }
      >
        <Plus size={14} />
        Yetenek Ekle
      </button>
      {catalog.isPending && (
        <small className="muted">Yetenekler yükleniyor...</small>
      )}
      {catalog.error && (
        <p className="error" role="alert">
          {errorText(catalog.error)}
        </p>
      )}
      {!catalog.isPending &&
        !catalog.error &&
        (!categories.length || !levels.length) && (
          <small className="muted">
            Kategori, seviye ve yetenek tanımlarını Ayarlar → Kategoriler → Yetenekler
            sayfasından ekleyin.
          </small>
        )}
    </section>
  );
}
