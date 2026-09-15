export const FOLLOW_UP_SOURCES = ['follow_up_chip', 'follow_up_custom'];

export function isFollowUpTask(task) {
  return FOLLOW_UP_SOURCES.includes(String(task?.source || ''));
}
