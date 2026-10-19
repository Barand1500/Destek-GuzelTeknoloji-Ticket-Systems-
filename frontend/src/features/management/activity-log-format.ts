import { displayEmail } from '../../utils/email';
import { richDescriptionFor as rawDescription, type ActivityLog } from '../../../../backend/src/utils/activity-log-format';
export { activityActionLabel, activityValueLabel, actionLabels, type ActivityLog } from '../../../../backend/src/utils/activity-log-format';

export function richDescriptionFor(log: ActivityLog) {
  return displayEmail(rawDescription(log));
}
