export function surveyCompletionRate(
  recipients: ReadonlyArray<{ userId: string }>,
  responses: ReadonlyArray<{ userId: string }>,
): number {
  const recipientIds = new Set(recipients.map(item => item.userId));
  if (!recipientIds.size) return 0;
  const respondentIds = new Set(responses.map(item => item.userId));
  const completed = [...recipientIds].filter(id => respondentIds.has(id)).length;
  return Math.round((completed / recipientIds.size) * 100);
}
