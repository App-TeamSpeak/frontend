import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthContext';
import { firebaseAuth } from '../firebase';
import { api, ApiError, type Room } from '../services/api';
import { roomError } from '../utils/roomError';
import {
  createRoomOperation, RoomOperationContext, useRoomOperation, withRoomDeadline,
  RoomRequestTimeout, ROOM_CREATION_TIMEOUT_MS, ROOM_REVIEW_TIMEOUT_MS,
} from './roomCreationState';

export function CopyRoomId({ id, compact = false }: { id: string; compact?: boolean }) {
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setFeedback({ kind: 'success', text: 'ID copiado.' });
    } catch {
      setFeedback({ kind: 'error', text: 'No pudimos copiar el ID. Selecciónalo para copiarlo manualmente.' });
    }
  }

  const copied = feedback?.kind === 'success';
  return <div className={`${compact ? 'my-0' : 'my-3'} flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 [overflow-wrap:anywhere]`}>
    <span className="room-card-id text-xs leading-4 text-muted">ID {id}</span>
    <button
      className={`inline-grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border p-0 cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 ${copied ? 'border-[#286a56] bg-[#103c30] text-success' : 'border-border bg-subtle text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:border-link [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:bg-stage-active [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:text-link-strong'}`}
      type="button"
      aria-label="Copiar ID"
      title="Copiar ID"
      data-copied={copied ? 'true' : undefined}
      onClick={() => void copy()}
    >
      {copied ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5V3.75A1.25 1.25 0 0 0 9.25 2.5h-5.5A1.25 1.25 0 0 0 2.5 3.75v5.5A1.25 1.25 0 0 0 3.75 10.5H5.5" />
        </svg>
      )}
    </button>
    <span
      role="status"
      className={`empty:absolute ${feedback ? `inline-flex min-h-[22px] items-center rounded-full border px-2 py-0.5 font-['Inter_Variable',sans-serif] text-[11px] leading-[1.2] font-semibold ${feedback.kind === 'success' ? 'border-[#286a56] bg-[#103c30] text-success' : 'border-[#995360] bg-[#3a202b] text-error'}` : ''}`}
    >
      {feedback?.text ?? ''}
    </span>
  </div>;
}

export function RoomCreationSession({ children }: { children: ReactNode }) {
  const uid = useOptionalAuth()?.user?.id;
  const identity = firebaseAuth.currentUser;
  const [session, setSession] = useState(() => ({ uid, identity, operation: createRoomOperation() }));
  if (session.uid !== uid || session.identity !== identity) {
    setSession({ uid, identity, operation: createRoomOperation() });
  }
  useLayoutEffect(() => {
    session.operation.setActive(true);
    return () => session.operation.setActive(false);
  }, [session]);
  return <RoomOperationContext.Provider value={session.operation}>{children}</RoomOperationContext.Provider>;
}

function CreationNavigation({ operation }: { operation: ReturnType<typeof createRoomOperation> }) {
  const blocker = useBlocker(() => operation.snapshot().phase === 'saving');
  const phase = operation.snapshot().phase;
  useEffect(() => {
    if (blocker.state !== 'blocked' || phase === 'saving') return;
    if (phase === 'created') blocker.proceed();
    else blocker.reset();
  }, [blocker, phase]);
  return null;
}

export function RoomCreation({ onCreated, onClose, onReviewed, dialog = false, protectNavigation = false }: {
  onCreated?: (room: Room) => void;
  onClose: () => void;
  onReviewed?: (rooms: Room[]) => void;
  dialog?: boolean;
  protectNavigation?: boolean;
}) {
  const uid = useOptionalAuth()?.user?.id;
  const { operation, state, shared } = useRoomOperation();
  const input = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<string>();
  const [invalid, setInvalid] = useState('');
  const name = draft ?? ('name' in state ? state.name : '');
  const saving = state.phase === 'saving';
  const reviewing = state.phase === 'reviewing';
  const uncertain = state.phase === 'uncertain' || reviewing || state.phase === 'reviewed';
  const reviewed = state.phase === 'reviewed' ? state.rooms : undefined;
  const created = state.phase === 'created' ? state.room : undefined;
  const fieldError = invalid || (draft === undefined && state.phase === 'error' && state.field ? state.message : '');
  const notice = 'message' in state && !(state.phase === 'error' && state.field) ? state.message : '';

  useEffect(() => {
    const element = modal.current;
    const opener = document.activeElement;
    if (element) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.open = true;
    }
    input.current?.focus();
    return () => {
      if (element?.open && typeof element.close === 'function') element.close();
      if (element && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (created) outcomeHeading.current?.focus();
  }, [created]);
  useEffect(() => {
    if (fieldError && !saving) input.current?.focus();
  }, [fieldError, saving]);
  useEffect(() => {
    if (!saving && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving, uncertain]);

  async function reviewRooms(identity = firebaseAuth.currentUser) {
    const previous = operation.snapshot();
    if (previous.phase !== 'uncertain' || !operation.current(identity) || (uid && identity?.uid !== uid)) return;
    const message = 'La sala podría haberse creado. Revisa tus salas antes de volver a enviar.';
    operation.set({ phase: 'reviewing', name: previous.name, message });
    try {
      const rooms = await withRoomDeadline(ROOM_REVIEW_TIMEOUT_MS, signal => api.listRooms(signal));
      if (!operation.current(identity)) return;
      operation.set({ phase: 'reviewed', name: previous.name, message, rooms });
      if (!shared) onReviewed?.(rooms);
    } catch (error) {
      if (operation.current(identity)) operation.set({ phase: 'uncertain', name: previous.name,
        reviewTimedOut: error instanceof RoomRequestTimeout,
        message: 'No pudimos actualizar tus salas. La creación anterior podría haberse completado.' });
    }
  }

  async function submit(retryUncertain = false) {
    const previous = operation.snapshot();
    if (previous.phase === 'saving' || previous.phase === 'created' ||
      (['uncertain', 'reviewing', 'reviewed'].includes(previous.phase) && (!retryUncertain || previous.phase !== 'reviewed'))) return;
    const value = name.trim();
    if (value.length < 1 || value.length > 80) {
      setInvalid('Ingresa un nombre de entre 1 y 80 caracteres.');
      input.current?.focus();
      return;
    }
    const identity = firebaseAuth.currentUser;
    if (uid && identity?.uid !== uid) {
      setInvalid('Tu sesión cambió. Vuelve a abrir el formulario.');
      return;
    }
    setDraft(undefined);
    operation.set({ phase: 'saving', name });
    try {
      const room = await withRoomDeadline(ROOM_CREATION_TIMEOUT_MS, signal => api.createRoom({ name: value }, signal));
      if (!operation.current(identity)) return;
      if (uid && room.ownerId !== uid) {
        throw new ApiError(502, { success: false, code: 'INVALID_RESPONSE', message: 'No pudimos confirmar la sala.' });
      }
      operation.set({ phase: 'created', name, room });
      if (!shared) onCreated?.(room);
    } catch (error) {
      if (!operation.current(identity)) return;
      if (error instanceof RoomRequestTimeout) {
        operation.set({ phase: 'uncertain', name,
          message: 'Se agotó el tiempo de espera. La sala podría haberse creado. Revisa tus salas antes de volver a enviar.' });
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        operation.set({ phase: 'error', name, field: true, message: 'Revisa el nombre de la sala.' });
      } else if (!(error instanceof ApiError) || error.code === 'INVALID_RESPONSE' || error.status >= 500 || error.status === 408) {
        operation.set({ phase: 'uncertain', name, message: 'La sala podría haberse creado.' });
        await reviewRooms(identity);
      } else {
        operation.set({ phase: 'error', name, message: roomError(error, 'No pudimos crear la sala. Inténtalo de nuevo.') });
      }
    }
  }

  function close() {
    const phase = operation.snapshot().phase;
    if (phase === 'saving' || phase === 'reviewing') return;
    if (phase === 'created' || phase === 'error') operation.set({ phase: 'idle' });
    onClose();
  }

  const btnBase = "inline-flex min-h-[44px] items-center justify-center gap-3 rounded-[10px] border font-['Inter_Variable',sans-serif] text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:opacity-60!";
  const actionBtn = `${btnBase} h-[44px] px-4 py-3 max-md:h-auto max-md:min-h-[46px] max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:rounded-[9px] max-md:px-2 max-md:text-center max-md:whitespace-normal`;
  const secondaryAction = `${actionBtn} w-[126px] border-border-strong bg-surface text-link-strong hover:not-disabled:bg-subtle`;
  const primaryAction = `${actionBtn} w-[156px] border-link bg-primary text-text hover:not-disabled:bg-primary-hover`;

  const content = created ? <>
    <h2 id="create-room-title" ref={outcomeHeading} tabIndex={-1} aria-label="Sala creada correctamente">
      <span className="max-md:hidden">Sala creada correctamente</span>
      <span className="hidden max-md:inline" aria-hidden="true">Sala creada</span>
    </h2>
    <p>Tu sala está lista para estudiar. Puedes encontrarla en el panel de salas.</p>
    <div className="my-[28px_22px] grid gap-[5px] rounded-xl border border-[#266a53] bg-[#12392d] px-4 py-[14px] text-success [overflow-wrap:anywhere] [&_p]:text-muted" role="status">
      <strong><span aria-hidden="true">✓</span> Creación completada</strong>
      <p>{created.name}</p>
    </div>
    <div className="flex justify-center">
      <button type="button" className={`${btnBase} min-w-[min(168px,100%)] border-link bg-primary px-5 py-3 text-text hover:not-disabled:bg-primary-hover max-md:w-full`} onClick={close}>Ir a mis salas</button>
    </div>
    <div className="mt-[14px] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-2">
      <CopyRoomId id={created.id} compact />
      <Link onClick={() => operation.set({ phase: 'idle' })} className={`${btnBase} border-border-strong bg-surface px-5 py-3 text-link-strong hover:bg-subtle`} to={`/salas/${encodeURIComponent(created.id)}`}>Entrar</Link>
    </div>
  </> : <>
    <h2 id="create-room-title">Crear sala</h2>
    <p className="mt-3 text-[15px] leading-[21px] text-muted">Configura una sala para tu grupo de estudio.</p>
    <form className="mt-9 max-md:mt-[30px]" onSubmit={event => { event.preventDefault(); void submit(); }} noValidate aria-busy={saving}>
      <div className="mb-5">
        <label className="mb-2 block text-sm leading-[18px] font-medium" htmlFor="create-room-name">Nombre de la sala</label>
        <input className="h-[52px] max-md:h-[51px] w-full rounded-[9px] border bg-surface px-4 py-3 text-text placeholder:text-muted placeholder:opacity-100 not-aria-[invalid=true]:border-border-strong aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-error-strong" ref={input} id="create-room-name" placeholder="Ej. Física · Grupo de laboratorio"
          value={name} required disabled={saving} aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? 'create-room-error' : undefined}
          onChange={event => { setDraft(event.target.value); setInvalid(''); }} />
        {fieldError && <p id="create-room-error" className="mt-1.5 text-xs leading-[18px] text-error [overflow-wrap:anywhere]" role="alert">{fieldError}</p>}
      </div>
      {saving ? <div role="status" className="my-3 text-[13px] text-muted max-md:my-4 max-md:min-h-[76px] max-md:rounded-xl max-md:border max-md:border-[#355d95] max-md:bg-surface-soft max-md:px-4 max-md:py-[11px] max-md:text-text [&_strong]:font-normal max-md:[&_strong]:block max-md:[&_strong]:font-['Inter_Variable',sans-serif] max-md:[&_strong]:text-[15px] max-md:[&_strong]:leading-5 max-md:[&_strong]:font-semibold [&_p]:hidden max-md:[&_p]:mt-1.5 max-md:[&_p]:block max-md:[&_p]:text-[13px] max-md:[&_p]:leading-[18px] max-md:[&_p]:text-muted">
        <strong>Creando sala…</strong>
        <p>Preparando tu espacio.</p>
      </div> :
        !notice && !fieldError && <p className="my-3 text-[13px] text-muted">El identificador se asigna al crear la sala.</p>}
      {notice && <div className="my-4 rounded-xl border border-[#995360] bg-[#3a202b] px-4 py-[11px] text-error [overflow-wrap:anywhere] max-md:min-h-[74px] [&_strong]:block [&_strong]:font-['Inter_Variable',sans-serif] [&_strong]:text-[15px] [&_strong]:leading-5 [&_p]:mt-1.5 [&_p]:text-[13px] [&_p]:leading-[18px] [&_p]:text-muted" role="alert">
        <strong>{uncertain ? 'Resultado sin confirmar' : 'Error al crear'}</strong>
        <p>{notice}</p>
      </div>}
      {reviewing && <p role="status">Actualizando tus salas…</p>}
      {uncertain && reviewed && <section className="my-4 max-h-[180px] overflow-auto rounded-xl border border-border bg-surface-soft px-4 py-[11px] [overflow-wrap:anywhere]" aria-label="Salas actualizadas">
        <p>Comprueba las salas y sus identificadores antes de decidir si vuelves a enviar.</p>
        {reviewed.length ? <ul>{reviewed.map(room => <li key={room.id}>{room.name} · ID {room.id}</li>)}</ul> : <p>La lista está vacía.</p>}
      </section>}
      <div className="mt-5 flex justify-end gap-3 max-md:flex-wrap max-md:gap-[13px]">
        <button className={secondaryAction} type="button" onClick={close} disabled={saving || reviewing}>Cancelar</button>
        {uncertain && !reviewed && !reviewing
          ? <button className={primaryAction} type="button" onClick={() => void reviewRooms()}>{state.phase === 'uncertain' && state.reviewTimedOut ? 'Reintentar consulta' : 'Actualizar mis salas'}</button>
          : uncertain && reviewed && !saving
            ? <button className={primaryAction} type="button" onClick={() => void submit(true)}>Crear otra vez</button>
            : <button className={primaryAction} type="submit" disabled={saving || reviewing}>
              {saving ? 'Creando…' : notice ? 'Reintentar' : 'Crear sala'}
            </button>}
      </div>
    </form>
  </>;

  const panelClass = `w-[min(500px,100%)] rounded-[20px] border border-border bg-surface px-8 pt-7 pb-6 shadow-[0_24px_64px_var(--dialog-shadow)] [overflow-wrap:anywhere] max-md:rounded-[19px] max-md:px-[23px] max-md:pt-[26px] max-md:pb-6 [&_h2]:text-[26px] [&_h2]:leading-8 max-md:[&_h2]:text-[25px] max-md:[&_h2]:leading-[30px] ${created ? 'min-h-[348px] pt-8 pb-6 max-md:min-h-[min(352px,calc(100dvh-32px))] max-md:[&_h2]:text-[26px] [&_h2]:focus:outline-none [&_h2]:focus:shadow-none [&>p]:mt-6 [&>p]:max-w-[44ch] [&>p]:text-[15px] [&>p]:text-muted' : 'min-h-[330px] max-md:min-h-[min(360px,calc(100dvh-32px))]'}`;
  const dialogClass = `${panelClass} fixed inset-0 m-auto max-w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] overflow-auto text-text backdrop:bg-overlay max-md:w-[min(358px,calc(100%-32px))]${!created && (saving || notice) ? ' max-md:min-h-[min(416px,calc(100dvh-32px))]' : ''}`;
  return <>{(protectNavigation || (dialog && shared)) && <CreationNavigation operation={operation} />}{dialog ? <dialog ref={modal} className={dialogClass}
    aria-labelledby="create-room-title" onCancel={event => {
      event.preventDefault();
      close();
    }}>{content}</dialog> : <section className={`${panelClass} mx-auto`}>{content}</section>}</>;
}
