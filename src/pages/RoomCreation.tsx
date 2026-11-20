import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthContext';
import { firebaseAuth } from '../firebase';
import { api, ApiError, type Room } from '../services/api';
import {
  createRoomOperation, RoomOperationContext, useRoomOperation, withRoomDeadline,
  RoomRequestTimeout, ROOM_CREATION_TIMEOUT_MS, ROOM_REVIEW_TIMEOUT_MS,
} from './roomCreationState';

export function roomError(error: unknown, fallback: string) {
  switch (error instanceof ApiError ? error.code : '') {
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID': return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 'EMAIL_NOT_VERIFIED': return 'Verifica tu correo para continuar.';
    case 'PROFILE_INCOMPLETE': return 'Completa tu perfil para continuar.';
    case 'PROFILE_INCONSISTENT': return 'Tu perfil requiere revisión.';
    case 'ACCOUNT_DELETION_PENDING':
    case 'ACCOUNT_DELETION_BLOCKED':
    case 'ACCOUNT_DELETED': return 'Tu cuenta no tiene acceso a las salas.';
    case 'ROOM_NOT_FOUND': return 'La sala no existe.';
    case 'ROOM_ACCESS_DENIED': return 'No tienes acceso a esta sala.';
    case 'AUTH_UNAVAILABLE':
    case 'FIRESTORE_UNAVAILABLE': return 'El servicio no está disponible. Inténtalo de nuevo.';
    default: return fallback;
  }
}

export function CopyRoomId({ id }: { id: string }) {
  const [feedback, setFeedback] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setFeedback('ID copiado.');
    } catch {
      setFeedback('No pudimos copiar el ID. Selecciónalo para copiarlo manualmente.');
    }
  }
  return <div className="room-id-actions">
    <span className="room-card-id">ID {id}</span>
    <button className="button secondary" type="button" onClick={() => void copy()}>Copiar ID</button>
    <span role="status">{feedback}</span>
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

  const content = created ? <>
    <h2 id="create-room-title" ref={outcomeHeading} tabIndex={-1}>Sala creada correctamente</h2>
    <p className="room-create-success" role="status">{created.name}</p>
    <CopyRoomId id={created.id} />
    <div className="room-management-dialog-actions">
      <button type="button" className="button secondary" onClick={close}>Ir a mis salas</button>
      <Link onClick={() => operation.set({ phase: 'idle' })} className="button primary" to={`/salas/${encodeURIComponent(created.id)}`}>Entrar</Link>
    </div>
  </> : <>
    <h2 id="create-room-title">Crear sala</h2>
    <p className="room-management-dialog-description">Configura una sala para tu grupo de estudio.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate aria-busy={saving}>
      <div className="form-field">
        <label htmlFor="create-room-name">Nombre de la sala</label>
        <input ref={input} id="create-room-name" placeholder="Ej. Física · Grupo de laboratorio"
          value={name} required disabled={saving} aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? 'create-room-error' : undefined}
          onChange={event => { setDraft(event.target.value); setInvalid(''); }} />
        {fieldError && <p id="create-room-error" className="field-error" role="alert">{fieldError}</p>}
      </div>
      {saving ? <p role="status" className="room-create-progress">Creando sala…</p> :
        !notice && <p className="room-create-note">El identificador se asigna al crear la sala.</p>}
      {notice && <div className="room-create-alert" role="alert">
        <strong>{uncertain ? 'Resultado sin confirmar' : 'Error al crear'}</strong>
        <p>{notice}</p>
      </div>}
      {reviewing && <p role="status">Actualizando tus salas…</p>}
      {uncertain && reviewed && <section className="room-create-review" aria-label="Salas actualizadas">
        <p>Comprueba las salas y sus identificadores antes de decidir si vuelves a enviar.</p>
        {reviewed.length ? <ul>{reviewed.map(room => <li key={room.id}>{room.name} · ID {room.id}</li>)}</ul> : <p>La lista está vacía.</p>}
      </section>}
      <div className="room-management-dialog-actions">
        <button className="button secondary" type="button" onClick={close} disabled={saving || reviewing}>Cancelar</button>
        {uncertain && !reviewed && !reviewing
          ? <button className="button primary" type="button" onClick={() => void reviewRooms()}>{state.phase === 'uncertain' && state.reviewTimedOut ? 'Reintentar consulta' : 'Actualizar mis salas'}</button>
          : uncertain && reviewed && !saving
            ? <button className="button primary" type="button" onClick={() => void submit(true)}>Crear otra vez</button>
            : <button className="button primary" type="submit" disabled={saving || reviewing}>
              {saving ? 'Creando…' : notice ? 'Reintentar' : 'Crear sala'}
            </button>}
      </div>
    </form>
  </>;

  return <>{(protectNavigation || (dialog && shared)) && <CreationNavigation operation={operation} />}{dialog ? <dialog ref={modal} className="room-management-dialog room-management-dialog-create room-create-dialog"
    aria-labelledby="create-room-title" onCancel={event => {
      event.preventDefault();
      close();
    }}>{content}</dialog> : <section className="room-management-dialog room-management-dialog-create room-create-page">{content}</section>}</>;
}
