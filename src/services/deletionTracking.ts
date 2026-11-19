export type DeletionTracking = {
  token: string;
  phase: 'unknown' | 'pending' | 'blocked' | 'reauth';
};

const ownerKey = 'teamspeak.deletion.owner';
const recordKey = (uid: string) => `teamspeak.deletion.receipt.${uid}`;
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

export function createDeletionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function rememberDeletionIdentity(uid: string) {
  sessionStorage.setItem(ownerKey, uid);
}

export function lastDeletionIdentity() {
  try { return sessionStorage.getItem(ownerKey); } catch { return null; }
}

export function readDeletionTracking(uid: string): DeletionTracking | null {
  try {
    const record = JSON.parse(sessionStorage.getItem(recordKey(uid)) ?? 'null');
    if (typeof record?.token === 'string' && tokenPattern.test(record.token) &&
        ['unknown', 'pending', 'blocked', 'reauth'].includes(record.phase)) return record;
  } catch {
    return null;
  }
  return null;
}

export function saveDeletionTracking(uid: string, record: DeletionTracking) {
  rememberDeletionIdentity(uid);
  sessionStorage.setItem(recordKey(uid), JSON.stringify(record));
}

export function clearDeletionTracking(uid: string, token: string) {
  try {
    if (readDeletionTracking(uid)?.token === token) sessionStorage.removeItem(recordKey(uid));
  } catch {
    // A browser storage failure cannot change a confirmed server result.
  }
}
