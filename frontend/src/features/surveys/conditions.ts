export type SurveyQuestion = {
  id: string;
  type: "SINGLE" | "MULTIPLE" | "TEXT" | "RATING" | "YES_NO";
  text: string;
  options?: string[];
  condition?: { questionId: string; option: string } | null;
};

export function conditionOptions(question: SurveyQuestion) {
  return question.type === "YES_NO" ? ["Evet", "Hayır"]
    : question.type === "SINGLE" || question.type === "MULTIPLE" ? question.options ?? [] : [];
}

export function visibleSurveyQuestions(questions: SurveyQuestion[], answers: Record<string, unknown>) {
  const visible = new Set<string>();
  return questions.filter(question => {
    const condition = question.condition;
    if (condition) {
      if (!visible.has(condition.questionId)) return false;
      const raw = answers[condition.questionId];
      const value = typeof raw === "boolean" ? raw ? "Evet" : "Hayır" : raw;
      if (Array.isArray(value) ? !value.includes(condition.option) : value !== condition.option) return false;
    }
    visible.add(question.id);
    return true;
  });
}

export function cleanSurveyAnswers(questions: SurveyQuestion[], answers: Record<string, unknown>) {
  return Object.fromEntries(visibleSurveyQuestions(questions, answers)
    .filter(question => answers[question.id] !== undefined)
    .map(question => [question.id, answers[question.id]]));
}
