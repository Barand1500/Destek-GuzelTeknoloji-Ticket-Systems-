import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../features/auth/Auth";
import { hasPermission } from '../features/auth/permissions';
import { api, errorText } from "../services/api";
import { DropdownSelect, MultiDropdownSelect } from "../components/DropdownSelect";
import { conditionOptions, visibleSurveyQuestions, cleanSurveyAnswers, type SurveyQuestion } from "../features/surveys/conditions";
import "./surveys.css";

type QuestionType = "SINGLE" | "MULTIPLE" | "TEXT" | "RATING" | "YES_NO";
type Question = SurveyQuestion;
type Response = {
  answers: Record<string, unknown>;
  respondentName: string | null;
};
type Survey = {
  id: string;
  title: string;
  description: string;
  anonymous: boolean;
  endsAt: string;
  closedAt?: string | null;
  questions: Question[];
  authorName: string;
  active: boolean;
  answered: boolean;
  participantCount?: number;
  recipientCount?: number;
  responses?: Response[];
};
type Directory = {
  people: Array<{
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    departmentIds: string[];
  }>;
  departments: Array<{ id: string; name: string }>;
  smsEnabled: boolean;
  emailEnabled: boolean;
};
const labels: Record<QuestionType, string> = {
  SINGLE: "Tek Seçim",
  MULTIPLE: "Çoklu Seçim",
  TEXT: "Yazılı Cevap",
  RATING: "Puan (1-5)",
  YES_NO: "Evet / Hayır",
};
const makeQuestion = (n: number): Question => ({
  id: `q-${Date.now()}-${n}`,
  type: "SINGLE",
  text: "",
  options: ["", ""],
});

export function SurveysPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const admin = user?.role === "ADMIN";
  const [screen, setScreen] = useState<"list" | "create">("list"),
    [answering, setAnswering] = useState<Survey | null>(null),
    [statistics, setStatistics] = useState<Survey | null>(null);
  const list = useQuery({
    queryKey: ["/surveys"],
    queryFn: async () => (await api.get("/surveys")).data.data as Survey[],
  });
  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["/surveys"] });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/surveys/${id}`),
    onSuccess: refresh,
  });
  const close = useMutation({
    mutationFn: (id: string) => api.post(`/surveys/${id}/close`),
    onSuccess: refresh,
  });
  if (screen === "create")
    return (
      <CreateSurveyPage
        cancel={() => setScreen("list")}
        done={() => {
          setScreen("list");
          refresh();
        }}
      />
    );
  const active = list.data?.filter((x) => x.active) ?? [],
    completed = list.data?.filter((x) => !x.active) ?? [];
  return (
    <main className="page surveys-page">
      <header className="surveys-heading">
        <div>
          <span className="eyebrow">EKİP DENEYİMİ</span>
          <h1>Anket & Oylama</h1>
          <p>
            {active.length} aktif anket · {completed.length} tamamlanmış
          </p>
        </div>
        {admin && hasPermission(user, 'surveys.create') && (
          <button
            className="button primary survey-create-trigger"
            onClick={() => setScreen("create")}
          >
            <Plus size={17} />
            Anket oluştur
          </button>
        )}
      </header>
      {list.isPending && <p className="muted">Anketler yükleniyor…</p>}
      {list.error && <p className="error">{errorText(list.error)}</p>}
      {!list.isPending && !list.data?.length && (
        <div className="survey-empty">
          <BarChart3 size={32} />
          <strong>Henüz anket oluşturulmamış</strong>
          <p>
            {admin
              ? "İlk anketi oluşturarak personel görüşlerini toplayın."
              : "Size gönderilen anketler burada görünecek."}
          </p>
        </div>
      )}
      {!!active.length && (
        <Section title="Aktif Anketler">
          {active.map((x) => (
            <Card
              key={x.id}
              survey={x}
              admin={!!admin}
              answer={() => setAnswering(x)}
              remove={() => remove.mutate(x.id)}
              close={() => close.mutate(x.id)}
              stats={() => setStatistics(x)}
            />
          ))}
        </Section>
      )}
      {!!completed.length && (
        <Section title="Tamamlanan Anketler" muted>
          {completed.map((x) => (
            <Card
              key={x.id}
              survey={x}
              admin={!!admin}
              answer={() => undefined}
              remove={() => remove.mutate(x.id)}
              close={() => undefined}
              stats={() => setStatistics(x)}
            />
          ))}
        </Section>
      )}
      {answering && (
        <AnswerModal
          survey={answering}
          close={() => setAnswering(null)}
          done={() => {
            setAnswering(null);
            refresh();
          }}
        />
      )}
      {statistics && (
        <StatisticsModal
          survey={statistics}
          close={() => setStatistics(null)}
        />
      )}
    </main>
  );
}

function Section({
  title,
  muted,
  children,
}: {
  title: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className={`survey-section-title${muted ? " muted-title" : ""}`}>
        {title}
      </h2>
      <div className="survey-grid">{children}</div>
    </section>
  );
}
function Card({
  survey,
  admin,
  answer,
  remove,
  close,
  stats,
}: {
  survey: Survey;
  admin: boolean;
  answer: () => void;
  remove: () => void;
  close: () => void;
  stats: () => void;
}) {
  const { user } = useAuth();
  const days = Math.max(
    0,
    Math.ceil((new Date(survey.endsAt).getTime() - Date.now()) / 86400000),
  );
  return (
    <article className="survey-card">
      <div className="survey-card-top">
        <span
          className={survey.active ? "survey-status active" : "survey-status"}
        >
          {survey.active ? "Aktif" : "Bitti"}
        </span>
        {survey.anonymous && (
          <span className="survey-anonymous">
            <Lock size={11} />
            Anonim
          </span>
        )}
        <span>{survey.questions.length} soru</span>
        <div className="survey-card-actions">
          {admin && (
            <>
              <button
                title="İstatistikler"
                aria-label="İstatistikler"
                onClick={stats}
                disabled={!hasPermission(user, 'surveys.statistics')}
              >
                <BarChart3 size={17} />
              </button>
              {survey.active && (
                <button
                  className="close-icon"
                  title="Anketi kapat"
                  aria-label="Anketi kapat"
                  onClick={close}
                  disabled={!hasPermission(user, 'surveys.update')}
                >
                  <Lock size={17} />
                </button>
              )}
              <button
                className="danger-icon"
                title="Anketi sil"
                aria-label="Anketi sil"
                onClick={remove}
                disabled={!hasPermission(user, 'surveys.delete')}
              >
                <Trash2 size={17} />
              </button>
            </>
          )}
        </div>
      </div>
      <h3>{survey.title}</h3>
      <p>{survey.description || "Açıklama eklenmedi."}</p>
      <div className="survey-meta">
        <span>
          {survey.participantCount ?? (survey.answered ? 1 : 0)} katılım
        </span>
        <span>{survey.active ? `${days} gün kaldı` : "Süre doldu"}</span>
        <span>{survey.authorName}</span>
      </div>
      {survey.active && (
        <button
          className="survey-vote"
          disabled={survey.answered}
          onClick={answer}
        >
          {survey.answered ? (
            <>
              <Check size={17} />
              Yanıtlandı
            </>
          ) : (
            "Oy kullan"
          )}
        </button>
      )}
    </article>
  );
}

function CreateSurveyPage({
  cancel,
  done,
}: {
  cancel: () => void;
  done: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([makeQuestion(0)]);
  const [channels, setChannels] = useState(["NOTIFICATION"]);
  const [anonymous, setAnonymous] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [selectedOverride, setSelectedOverride] = useState<string[] | null>(null);
  const directory = useQuery({
    queryKey: ["/surveys/directory"],
    queryFn: async () =>
      (await api.get("/surveys/directory")).data.data as Directory,
  });
  const create = useMutation({
    mutationFn: (payload: unknown) => api.post("/surveys", payload),
    onSuccess: done,
  });
  const people = useMemo(
    () =>
      (directory.data?.people ?? []).filter(
        (person) =>
          !departmentId || person.departmentIds.includes(departmentId),
      ),
    [directory.data, departmentId],
  );
  const selected = selectedOverride === null
    ? people.map((person) => person.id)
    : selectedOverride.filter((id) => people.some((person) => person.id === id));
  const recipients = people.filter((person) => selected.includes(person.id));
  const missingPhones = recipients.filter((person) => !person.phone).length;
  const missingEmails = recipients.filter((person) => !person.email).length;
  const patchQuestion = (index: number, patch: Partial<Question>) =>
    setQuestions(all => {
      const previous = all[index];
      const updated = { ...previous, ...patch };
      return all.map((question, itemIndex) => {
        if (itemIndex === index) return updated;
        if (question.condition?.questionId !== previous.id) return question;
        const options = conditionOptions(updated);
        if (!options.length) return { ...question, condition: null };
        if (options.includes(question.condition.option)) return question;
        const optionIndex = conditionOptions(previous).indexOf(question.condition.option);
        return { ...question, condition: { ...question.condition, option: options[optionIndex] ?? options[0] } };
      });
    });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      title: form.get("title"),
      description: form.get("description"),
      durationDays: Number(form.get("durationDays")),
      anonymous: form.get("anonymous") === "on",
      questions,
      departmentId: departmentId || null,
      recipientMode: "SELECTED",
      recipientIds: selected,
      channels,
    });
  };
  const options = people.map((person) => ({
    value: person.id,
    label: person.name,
  }));
  return (
    <main className="page surveys-page survey-create-page">
      <header className="surveys-heading">
        <div>
          <span className="eyebrow">EKİP DENEYİMİ</span>
          <h1>Anket & Oylama</h1>
          <p>Yeni anket hazırlayın ve personellerle paylaşın.</p>
        </div>
      </header>
      <form className="survey-create-panel" onSubmit={submit}>
        <h2>Yeni Anket Oluştur</h2>
        <div className="survey-create-body">
          <div className="survey-basics">
            <label className="survey-floating-field">
              <span>Anket Başlığı *</span>
              <input name="title" required />
            </label>
            <label className="survey-floating-field">
              <span>Açıklama</span>
              <input name="description" />
            </label>
            <div className="survey-duration-row">
              <label className="survey-floating-field survey-duration">
                <span>Süre (gün)</span>
                <input
                  name="durationDays"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue="7"
                  required
                />
              </label>
              <div className="survey-anonymous-control">
                <input
                  id="survey-anonymous"
                  name="anonymous"
                  type="checkbox"
                  checked={anonymous}
                  onChange={(event) => setAnonymous(event.target.checked)}
                />
                <label htmlFor="survey-anonymous">Anonim Oylama</label>
                {anonymous ? (
                  <Lock
                    className="survey-privacy-icon is-locked"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <LockOpen
                    className="survey-privacy-icon"
                    size={15}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          </div>
          <section className="survey-audience">
            <div className="survey-audience-controls">
              <label className="survey-floating-field">
                <span>Hedef departman</span>
                <DropdownSelect
                  ariaLabel="Hedef departman"
                  value={departmentId}
                  onChange={(value) => {
                    setDepartmentId(value);
                    setSelectedOverride(null);
                  }}
                  options={[
                    { value: "", label: "Tüm departmanlar" },
                    ...(directory.data?.departments.map((department) => ({
                      value: department.id,
                      label: department.name,
                    })) ?? []),
                  ]}
                />
              </label>
              <MultiDropdownSelect
                label="Seçilen kişiler"
                ariaLabel="Gönderilecek kişileri seçin"
                emptyLabel="Seçin"
                className="survey-recipient-select"
                selectionLabel="Seçilen kişiler"
                showVisibleToggle
                value={selected}
                onChange={setSelectedOverride}
                options={options}
              />
            </div>
          </section>
          <section>
            <h3>Sorular</h3>
            <div className="survey-questions">
              {questions.map((question, index) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  previousQuestions={questions.slice(0, index)}
                  index={index}
                  update={(patch) => patchQuestion(index, patch)}
                  remove={() =>
                    setQuestions((all) =>
                      all.filter((_, itemIndex) => itemIndex !== index).map(item => item.condition?.questionId === question.id ? { ...item, condition: null } : item),
                    )
                  }
                />
              ))}
            </div>
            <button
              className="survey-add-question"
              type="button"
              onClick={() =>
                setQuestions((all) => [...all, makeQuestion(all.length)])
              }
            >
              <Plus size={17} />
              Soru ekle
            </button>
          </section>
          <ChannelSelector
            channels={channels}
            setChannels={setChannels}
            directory={directory.data}
            missingPhones={missingPhones}
            missingEmails={missingEmails}
          />
          {create.error && <p className="error">{errorText(create.error)}</p>}
        </div>
        <footer>
          <button type="button" className="button secondary" onClick={cancel}>
            İptal
          </button>
          <button
            className="button primary"
            disabled={create.isPending || !channels.length}
          >
            {create.isPending ? "Yayınlanıyor…" : "Anketi yayınla"}
          </button>
        </footer>
      </form>
    </main>
  );
}

function ChannelSelector({
  channels,
  setChannels,
  directory,
  missingPhones,
  missingEmails,
}: {
  channels: string[];
  setChannels: (channels: string[]) => void;
  directory?: Directory;
  missingPhones: number;
  missingEmails: number;
}) {
  const items = [
    {
      id: "NOTIFICATION",
      label: "Bildirim",
      description: "Uygulama içi bildirim",
      icon: Bell,
      available: true,
    },
    {
      id: "SMS",
      label: "SMS",
      description: "Telefon numarasına gönder",
      icon: MessageSquare,
      available: !!directory?.smsEnabled,
    },
    {
      id: "EMAIL",
      label: "E-posta",
      description: "E-posta adresine gönder",
      icon: Mail,
      available: !!directory?.emailEnabled,
    },
  ];
  return (
    <section className="survey-channel-section">
      <h3>
        <Send size={17} />
        Gönderim kanalları
      </h3>
      <p className="survey-channel-help">
        Bir veya birden fazla kanal seçebilirsiniz.
      </p>
      <div className="survey-channels">
        {items.map(({ id, label, description, icon: Icon, available }) => (
          <label
            key={id}
            className={`${channels.includes(id) ? "selected" : ""}${!available ? " unavailable" : ""}`}
          >
            <input
              type="checkbox"
              checked={channels.includes(id)}
              disabled={!available}
              onChange={(event) =>
                setChannels(
                  event.target.checked
                    ? [...channels, id]
                    : channels.filter((channel) => channel !== id),
                )
              }
            />
            <Icon size={20} />
            <strong>{label}</strong>
            <small>{available ? description : "Entegrasyon etkin değil"}</small>
          </label>
        ))}
      </div>
      {channels.includes("SMS") && (
        <p className="survey-channel-note">
          SMS, başlık ve duyuru metnini içerir. Dosyalar SMS’e eklenmez; uzun
          mesajlar birden fazla SMS olarak ücretlendirilebilir.
        </p>
      )}
      {((channels.includes("SMS") && missingPhones > 0) ||
        (channels.includes("EMAIL") && missingEmails > 0)) && (
        <p className="survey-channel-warning">
          {channels.includes("SMS") && missingPhones > 0
            ? `${missingPhones} kişinin telefon bilgisi eksik. `
            : ""}
          {channels.includes("EMAIL") && missingEmails > 0
            ? `${missingEmails} kişinin e-posta bilgisi eksik. `
            : ""}
          Bu kişilere ilgili kanaldan gönderim yapılamaz.
        </p>
      )}
    </section>
  );
}

function QuestionEditor({
  question,
  previousQuestions,
  index,
  update,
  remove,
}: {
  question: Question;
  previousQuestions: Question[];
  index: number;
  update: (x: Partial<Question>) => void;
  remove: () => void;
}) {
  const choice = question.type === "SINGLE" || question.type === "MULTIPLE";
  const conditionSources = previousQuestions.filter(item => conditionOptions(item).length > 0);
  const source = conditionSources.find(item => item.id === question.condition?.questionId);
  return (
    <article className="survey-question-editor">
      <div className="survey-question-head">
        <span>Soru {index + 1}</span>
        <DropdownSelect
          ariaLabel={`Soru ${index + 1} türü`}
          value={question.type}
          onChange={(value) => {
            const type = value as QuestionType;
            update({
              type,
              options:
                type === "SINGLE" || type === "MULTIPLE"
                  ? (question.options ?? ["", ""])
                  : undefined,
            });
          }}
          options={Object.entries(labels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <button type="button" onClick={remove} disabled={index === 0}>
          <X size={16} />
        </button>
      </div>
      {index > 0 && <div className={`survey-question-condition${question.condition ? " active" : ""}`}>
        <GitBranch size={16} aria-hidden="true" />
        <DropdownSelect
          label="Koşul"
          ariaLabel={`Soru ${index + 1} gösterim koşulu`}
          value={question.condition?.questionId ?? ""}
          onChange={value => {
            const source = previousQuestions.find(item => item.id === value);
            update({ condition: source ? { questionId: source.id, option: conditionOptions(source)[0] ?? "" } : null });
          }}
          options={[{ value: "", label: "Koşulsuz (her zaman göster)" }, ...conditionSources.map(item => ({ value: item.id, label: `Soru ${previousQuestions.indexOf(item) + 1}: ${item.text || "Soru metni"} cevabına bağlı` }))]}
        />
        {source && <>
          <span className="survey-condition-arrow">→</span>
          <DropdownSelect label="Seçenek" ariaLabel={`Soru ${index + 1} koşul seçeneği`} value={question.condition?.option ?? ""} onChange={option => update({ condition: { questionId: source.id, option } })} options={conditionOptions(source).filter(option => option.trim()).map(option => ({ value: option, label: option }))} />
          <span>seçilirse göster</span>
        </>}
      </div>}
      <label className="survey-floating-field survey-question-text-field">
        <span>Soru metni *</span>
        <input
          className="survey-question-text"
          value={question.text}
          onChange={(e) => update({ text: e.target.value })}
          required
        />
      </label>
      {choice && (
        <div className="survey-options">
          {question.options?.map((option, n) => (
            <div key={n}>
              <span>{String.fromCharCode(65 + n)}</span>
              <label className="survey-floating-field">
                <span>Seçenek {String.fromCharCode(65 + n)} *</span>
                <input
                  value={option}
                  required
                  onChange={(e) =>
                    update({
                      options: question.options?.map((x, i) =>
                        i === n ? e.target.value : x,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({ options: [...(question.options ?? []), ""] })
            }
          >
            <Plus size={14} />
            Seçenek ekle
          </button>
        </div>
      )}
      {question.type === "RATING" && (
        <div className="rating-preview">
          <Star size={19} />
          Katılımcılar 1-5 arası puan verecek
        </div>
      )}
    </article>
  );
}

function StatisticsModal({
  survey,
  close,
}: {
  survey: Survey;
  close: () => void;
}) {
  const responses = survey.responses ?? [];
  return (
    <div className="survey-overlay">
      <div className="survey-statistics-modal" role="dialog" aria-modal="true" aria-label={`İstatistikler: ${survey.title}`}>
        <header>
          <div>
            <h2>İstatistikler: {survey.title}</h2>
            <p>
              {responses.length} katılımcı ·{" "}
              {survey.active ? "Açık" : "Tamamlandı"} · {survey.authorName}{" "}
              tarafından
            </p>
          </div>
          <button className="icon-button" onClick={close} aria-label="İstatistikleri kapat">
            <X size={20} />
          </button>
        </header>
        <div className="survey-stat-summary">
          <Stat label="Toplam Katılım" value={responses.length} />
          <Stat label="Soru Sayısı" value={survey.questions.length} />
          <Stat
            label="Tamamlanma"
            value={
              survey.recipientCount
                ? `${Math.round((responses.length / survey.recipientCount) * 100)}%`
                : "0%"
            }
          />
        </div>
        <div className="survey-stat-list">
          {survey.questions.map((q, i) => (
            <QuestionStats
              key={q.id}
              question={q}
              index={i}
              responses={responses}
              anonymous={survey.anonymous}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function QuestionStats({
  question,
  index,
  responses,
  anonymous,
}: {
  question: Question;
  index: number;
  responses: Response[];
  anonymous: boolean;
}) {
  const answers = responses
    .map((r) => r.answers[question.id])
    .filter((x) => x !== undefined && x !== null && (typeof x !== "string" || x.trim()));
  if (question.type === "RATING") {
    const scores = answers.filter((x): x is number => typeof x === "number");
    const avg = scores.length
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : "0";
    return (
      <article className="survey-stat-question">
        <span>
          S{index + 1} · Puan · {answers.length} yanıt
        </span>
        <h3>{question.text}</h3>
        <strong className="survey-average">
          <Star size={22} /> {avg} <small>/ 5</small>
        </strong>
      </article>
    );
  }
  if (question.type === "TEXT")
    return (
      <article className="survey-stat-question">
        <span>
          S{index + 1} · Yazılı cevap · {answers.length} yanıt
        </span>
        <h3>{question.text}</h3>
        {answers.length ? <ul className="survey-written-answers">
          {responses.filter(response => typeof response.answers[question.id] === "string" && String(response.answers[question.id]).trim()).map((response, index) => <li key={index}>
            <strong>{anonymous ? "Anonim katılımcı" : response.respondentName || "Katılımcı"}</strong>
            <p>{String(response.answers[question.id])}</p>
          </li>)}
        </ul> : <p>Henüz yanıt yok.</p>}
      </article>
    );
  const choices = answers as Array<string | string[]>;
  const options =
    question.type === "YES_NO" ? ["Evet", "Hayır"] : (question.options ?? []);
  return (
    <article className="survey-stat-question">
      <span>
        S{index + 1} · {labels[question.type]} · {answers.length} yanıt
      </span>
      <h3>{question.text}</h3>
      {options.map((option) => {
        const count = choices.reduce(
          (total: number, answer) =>
            total +
            (Array.isArray(answer)
              ? answer.includes(option)
                ? 1
                : 0
              : answer === option
                ? 1
                : 0),
          0,
        );
        const percent = answers.length
          ? Math.round((count / answers.length) * 100)
          : 0;
        return (
          <div className="survey-stat-bar" key={option}>
            <div>
              <span>{option}</span>
              <strong>
                {percent}% <small>({count})</small>
              </strong>
            </div>
            <i>
              <b style={{ width: `${percent}%` }} />
            </i>
          </div>
        );
      })}
    </article>
  );
}

function AnswerModal({
  survey,
  close,
  done,
}: {
  survey: Survey;
  close: () => void;
  done: () => void;
}) {
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState<Record<string, unknown>>({});
  const visibleQuestions = visibleSurveyQuestions(survey.questions, answers);
  const question = visibleQuestions[step];
  const submit = useMutation({
    mutationFn: () => api.post(`/surveys/${survey.id}/responses`, { answers: cleanSurveyAnswers(survey.questions, answers) }),
    onSuccess: done,
  });
  const valid =
    answers[question.id] !== undefined &&
    (typeof answers[question.id] !== "string" || Boolean((answers[question.id] as string).trim())) &&
    (!Array.isArray(answers[question.id]) ||
      (answers[question.id] as unknown[]).length > 0);
  return (
    <div className="survey-overlay">
      <div className="survey-answer-modal" role="dialog" aria-modal="true" aria-label={survey.title}>
        <header>
          <h2>{survey.title}</h2>
          <button className="icon-button" onClick={close} aria-label="Anketi kapat">
            <X size={20} />
          </button>
        </header>
        <div className="survey-progress">
          {visibleQuestions.map((_, i) => (
            <i key={i} className={i <= step ? "active" : ""} />
          ))}
        </div>
        <small>
          Soru {step + 1} / {visibleQuestions.length}
        </small>
        <h3>{question.text}</h3>
        <p>
          {question.type === "MULTIPLE"
            ? "Birden fazla seçenek işaretleyebilirsiniz"
            : question.type === "RATING"
              ? "1-5 arası puan verin"
              : "Cevabınızı seçin"}
        </p>
        <AnswerInput
          question={question}
          value={answers[question.id]}
          change={(value) =>
            setAnswers(all => cleanSurveyAnswers(survey.questions, { ...all, [question.id]: value }))
          }
        />
        {submit.error && <p className="error">{errorText(submit.error)}</p>}
        <footer>
          {step ? (
            <button
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft size={17} />
              Geri
            </button>
          ) : (
            <span />
          )}
          {step < visibleQuestions.length - 1 ? (
            <button
              className="button primary"
              disabled={!valid}
              onClick={() => setStep(step + 1)}
            >
              Sonraki
              <ChevronRight size={17} />
            </button>
          ) : (
            <button
              className="button primary"
              disabled={!valid || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Gönderiliyor…" : "Gönder"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
function AnswerInput({
  question,
  value,
  change,
}: {
  question: Question;
  value: unknown;
  change: (x: unknown) => void;
}) {
  if (question.type === "TEXT")
    return (
      <textarea
        className="survey-text-answer"
        aria-label={question.text}
        maxLength={5000}
        value={(value as string) ?? ""}
        onChange={(e) => change(e.target.value)}
        placeholder="Cevabınızı yazın…"
      />
    );
  if (question.type === "RATING")
    return (
      <div className="survey-rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => change(n)}
            className={(value as number) >= n ? "active" : ""}
          >
            <Star size={38} />
          </button>
        ))}
      </div>
    );
  const options =
    question.type === "YES_NO" ? ["Evet", "Hayır"] : (question.options ?? []);
  return (
    <div className="survey-answer-options">
      {options.map((option, n) => {
        const selected =
          question.type === "MULTIPLE"
            ? ((value as string[]) ?? []).includes(option)
            : value === option;
        return (
          <button
            key={option}
            className={selected ? "selected" : ""}
            onClick={() =>
              question.type === "MULTIPLE"
                ? change(
                    selected
                      ? (value as string[]).filter((x) => x !== option)
                      : [...((value as string[]) ?? []), option],
                  )
                : change(option)
            }
          >
            <span>{String.fromCharCode(65 + n)}</span>
            {option}
            {selected && <Check size={17} />}
          </button>
        );
      })}
    </div>
  );
}
