import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSkills, rankStaff } from "../src/services/skill-matching.js";
import { updateUserSchema } from "../src/validators/management.js";

const skill = (name: string, level = "INTERMEDIATE") => ({
  name,
  level,
  category: "Test",
});
test("matches multiple technologies and languages, including aliases and Turkish letters", () => {
  const skills = [
    skill("React"),
    skill("Python"),
    skill("İngilizce"),
    skill("Almanca"),
    skill("Vue.js"),
  ];
  assert.deepEqual(
    matchSkills(
      "REACTJS ve Python hatası; English ve ALMANCA destek gerekiyor.",
      skills,
    ).map((item) => item.name),
    ["React", "Python", "İngilizce", "Almanca"],
  );
  assert.equal(matchSkills("vue ile hata var", skills)[0].name, "Vue.js");
  assert.equal(
    matchSkills("Özel ürün entegrasyonu", [skill("Özel Ürün")]).length,
    1,
  );
});
test("does not match unrelated substrings or confuse C, C# and C++", () => {
  assert.equal(
    matchSkills("reaction mysql", [skill("React"), skill("SQL")]).length,
    0,
  );
  assert.deepEqual(
    matchSkills("C++ hatası", [skill("C"), skill("C#"), skill("C++")]).map(
      (item) => item.name,
    ),
    ["C++"],
  );
  assert.deepEqual(
    matchSkills("C# hatası", [skill("C"), skill("C#"), skill("C++")]).map(
      (item) => item.name,
    ),
    ["C#"],
  );
  assert.equal(matchSkills("", [skill("React")]).length, 0);
});
test("ranks wider coverage before level and orders equally matched staff by level", () => {
  const staff = [
    { id: "expert", name: "Uzman", skills: [skill("React", "EXPERT")] },
    {
      id: "all",
      name: "Çoklu",
      skills: [
        skill("React", "BEGINNER"),
        skill("İngilizce", "BEGINNER"),
        skill("Almanca", "BEGINNER"),
      ],
    },
    { id: "beginner", name: "Başlangıç", skills: [skill("React", "BEGINNER")] },
    { id: "none", name: "Diğer", skills: [skill("PHP")] },
  ];
  assert.deepEqual(
    rankStaff("React, İngilizce ve Almanca", staff).map((item) => item.id),
    ["all", "expert", "beginner"],
  );
});
test("validates multiple language levels and rejects duplicate skills and invalid levels", () => {
  assert.equal(
    updateUserSchema.parse({
      skills: [skill("İngilizce", "ADVANCED"), skill("Almanca", "BEGINNER")],
    }).skills?.length,
    2,
  );
  assert.equal(
    updateUserSchema.safeParse({ skills: [skill("React"), skill("react")] })
      .success,
    false,
  );
  assert.equal(
    updateUserSchema.safeParse({ skills: [skill("React", "INVALID")] }).success,
    false,
  );
});
