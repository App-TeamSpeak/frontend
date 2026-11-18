import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { firebaseAuth } from '../firebase';
import type { Room } from '../services/api';

export const ROOM_CREATION_TIMEOUT_MS = 20_000;
export const ROOM_REVIEW_TIMEOUT_MS = 12_000;

export class RoomRequestTimeout extends Error {}

export async function withRoomDeadline<T>(
  milliseconds: number, request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RoomRequestTimeout());
      controller.abort();
    }, milliseconds);
  });
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

type CreationState =
  | { phase: 'idle' }
  | { phase: 'saving'; name: string }
  | { phase: 'created'; name: string; room: Room }
  | { phase: 'error'; name: string; message: string; field?: boolean }
  | { phase: 'uncertain' | 'reviewing'; name: string; message: string; reviewTimedOut?: boolean }
  | { phase: 'reviewed'; name: string; message: string; rooms: Room[] };

export function createRoomOperation() {
  let state: CreationState = { phase: 'idle' };
  let active = true;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => state,
    set(next: CreationState) {
      state = next;
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setActive(value: boolean) { active = value; },
    current(identity: typeof firebaseAuth.currentUser) {
      return active && firebaseAuth.currentUser === identity;
    },
  };
}

export const RoomOperationContext = createContext<ReturnType<typeof createRoomOperation> | null>(null);

export function useRoomOperation() {
  const shared = useContext(RoomOperationContext);
  const [standalone] = useState(createRoomOperation);
  const operation = shared ?? standalone;
  const state = useSyncExternalStore(operation.subscribe, operation.snapshot);
  return { operation, state, shared: shared !== null };
}
