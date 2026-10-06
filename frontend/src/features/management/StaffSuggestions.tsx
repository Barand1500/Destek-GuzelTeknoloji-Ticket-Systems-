import { useEffect, useId, useState } from "react";
import { api } from "../../services/api";
import type { Department, StaffSkill } from "../../types";
import { skillLevels } from "./StaffSkills";

type Suggestion = {
  id: string;
  name: string;
  matches: StaffSkill[];
  departments: Department[];
};
const skillStars: Record<StaffSkill["level"], string> = {
  BEGINNER: "★",
  INTERMEDIATE: "★★",
  ADVANCED: "★★★",
  EXPERT: "★★★★",
};
export function SuggestedDescription({
  departmentId,
  assignedAgentId,
  onSelect,
}: {
  departmentId: string;
  assignedAgentId: string;
  onSelect: (person: {
    id: string;
    name: string;
    departmentId: string;
    departmentName: string;
  }) => void;
}) {
  const [text, setText] = useState("");
  const searchText = text.trim();
  const descriptionId = useId();
  const [result, setResult] = useState<{
    text: string;
    data: Suggestion[];
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!searchText) return;
    const controller = new AbortController();
    // Search only after typing stops. Realtime cache invalidations must not
    // resubmit the description while the user is completing the form.
    const timer = window.setTimeout(() => {
      void api
        .post<{ data: Suggestion[] }>(
          "/staff-suggestions",
          { text: searchText },
          { signal: controller.signal },
        )
        .then((response) => {
          if (!controller.signal.aborted)
            setResult({
              text: searchText,
              data: response.data.data,
              error: false,
            });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({ text: searchText, data: [], error: true });
        });
    }, 1000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchText]);
  return (
    <div className="phone-request-message">
      <label htmlFor={descriptionId}>
        <span className="field-label">Açıklama</span>
        <textarea
          id={descriptionId}
          name="message"
          required
          maxLength={10000}
          rows={4}
          placeholder="Örn. React ekranında hata var; İngilizce destek gerekiyor…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {searchText && result?.text === searchText && (
        <div className="staff-suggestions" aria-live="polite">
          {result.error && (
            <small>
              Personel önerileri yüklenemedi. Departman ve personeli elle
              seçebilirsiniz.
            </small>
          )}
          {!!result.data.length && (
            <>
              <small>
                Yetenek ve dil eşleşmesine göre önerilen personeller
              </small>
              <div className="staff-suggestion-list">
                {result.data.map((person) => {
                  const department =
                    person.departments.find(
                      (item) => item.id === departmentId,
                    ) ?? person.departments[0];
                  if (!department) return null;
                  const selected =
                    assignedAgentId === person.id &&
                    departmentId === department.id;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      aria-pressed={selected}
                      className={selected ? "selected" : ""}
                      onClick={() =>
                        onSelect({
                          id: person.id,
                          name: person.name,
                          departmentId: department.id,
                          departmentName: department.name,
                        })
                      }
                    >
                      <strong>
                        {person.name}
                        {selected ? " ✓" : ""}
                      </strong>
                      <small>{department.name}</small>
                      <span className="staff-suggestion-skills">
                        {person.matches.map((skill, index) => (
                          <span className="staff-suggestion-skill" key={`${skill.name}-${index}`}>
                            <span className="staff-suggestion-skill-name">{skill.name}</span>
                            <span>· {skillLevels[skill.level]}</span>
                            <span className="staff-suggestion-stars" aria-hidden="true">
                              ({skillStars[skill.level]})
                            </span>
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
