import type { Message, MessageHistoryPage } from '../services/api';

function authorInitials(value: string): string {
  return value.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'US';
}

export function formatMessageAuthor(
  source: { authorId: string | null; authorDeleted?: boolean; authorName?: string | null },
  currentUserId?: string,
): { sender: string; initials: string } {
  if (source.authorDeleted || !source.authorId) {
    return { sender: 'Usuario eliminado', initials: 'UE' };
  }
  if (source.authorId === currentUserId) {
    return { sender: 'Tú', initials: 'T' };
  }
  const resolvedName = typeof source.authorName === 'string' ? source.authorName.trim() : '';
  const sender = resolvedName || `Usuario ${source.authorId.slice(0, 6)}`;
  return { sender, initials: authorInitials(sender) };
}

export function messageAvatarTone(
  source: { authorId: string | null; authorDeleted?: boolean },
  currentUserId?: string,
): 0 | 1 | 2 | 3 {
  if (source.authorId && source.authorId === currentUserId) {
    return 0;
  }
  if (source.authorDeleted || !source.authorId) {
    return 1;
  }
  let hash = 0;
  for (let i = 0; i < source.authorId.length; i += 1) {
    hash = (hash * 31 + source.authorId.charCodeAt(i)) >>> 0;
  }
  return ((hash % 3) + 1) as 1 | 2 | 3;
}

export function mergeHistoryPage<T extends { id: string; createdAt?: string }>(
  current: T[],
  page: T[],
  kind: 'initial' | 'older',
): T[] {
  const existingIds = new Set(current.map(item => item.id));
  const prepended: T[] = [];
  const seenInPage = new Set<string>();
  for (const item of page) {
    if (existingIds.has(item.id) || seenInPage.has(item.id)) continue;
    seenInPage.add(item.id);
    prepended.push(item);
  }
  if (!prepended.length) return current;
  const combined = [...prepended, ...current];
  if (kind !== 'initial') return combined;
  return combined
    .map((item, index) => ({ item, index, time: item.createdAt ? Date.parse(item.createdAt) : Number.NaN }))
    .sort((left, right) => {
      if (Number.isFinite(left.time) && Number.isFinite(right.time) && left.time !== right.time) {
        return left.time - right.time;
      }
      return left.index - right.index;
    })
    .map(entry => entry.item);
}

export function appendLiveMessage<T extends { id: string }>(current: T[], incoming: T): T[] {
  if (current.some(item => item.id === incoming.id)) return current;
  return [...current, incoming];
}

export function normalizeHistoryResult(
  result: MessageHistoryPage | Message[],
): MessageHistoryPage {
  if (Array.isArray(result)) {
    return { messages: result, nextCursor: null };
  }
  return result;
}
