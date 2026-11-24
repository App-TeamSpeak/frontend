export const CHAT_BOTTOM_THRESHOLD_PX = 24;

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/**
 * Determines whether a scrollable chat container is at or near the bottom edge.
 */
export function isNearBottom(
  { scrollTop, scrollHeight, clientHeight }: ScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  if (scrollHeight <= clientHeight + threshold) {
    return true;
  }
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * Formats the accessible label for the unread live messages indicator.
 */
export function formatNewMessagesLabel(unreadCount: number): string {
  const safeCount = Math.max(1, Math.floor(unreadCount));
  return `Mensajes nuevos (${safeCount}) · Ir al final`;
}
