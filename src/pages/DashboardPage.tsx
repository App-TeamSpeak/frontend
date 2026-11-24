import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthContext';
import { JoinRoomForm } from '../components/JoinRoomForm';
import { useRoomOperation } from './roomCreationState';
import { CopyRoomId, RoomCreation } from './RoomCreation';
import { PageTitle } from '../components/PageTitle';
import { api, type Room } from '../services/api';
import { roomError } from '../utils/roomError';

type RoomPreview = Room & { accent: string };

type DashboardStatus = 'loading' | 'success' | 'error' | 'empty';
type RoomDialogState = { kind: 'create' } | { kind: 'join' } | { kind: 'edit'; room: RoomPreview } | { kind: 'delete'; room: RoomPreview } | null;

const accents = ['#2857c5', '#0f766e', '#7c3aed'];
function toPreview(room: Room, index: number): RoomPreview { return { ...room, accent: accents[index % accents.length] }; }

function RoomCardSkeleton({ accent }: { accent: string }) {
  return <article className="room-card room-card-skeleton" style={{ '--room-accent': accent } as React.CSSProperties} aria-hidden="true">
    <div className="room-card-accent-clip"><div className="room-card-accent" /></div>
    <div className="room-card-content">
      <span className="skeleton-block skeleton-shimmer skeleton-title" />
      <span className="skeleton-block skeleton-shimmer skeleton-meta" />
      <span className="skeleton-block skeleton-shimmer skeleton-id" />
      <span className="skeleton-block skeleton-shimmer skeleton-participants" />
      <span className="skeleton-live-row"><span className="skeleton-live-dot" /><span className="skeleton-block skeleton-shimmer skeleton-live-text" /></span>
      <span className="skeleton-block skeleton-shimmer skeleton-action" />
    </div>
  </article>;
}

function RoomLoadError({ onRetry, message }: { onRetry: () => void; message: string }) {
  return <article className="room-load-error">
    <div className="room-load-error-summary" role="alert">
      <div className="room-load-error-icon" aria-hidden="true">
        <img src="/assets/figma/error-state.svg" alt="" />
        <span>!</span>
      </div>
      <h3 className="room-load-error-title">No pudimos cargar tus salas</h3>
      <p className="room-load-error-description">{message}</p>
    </div>
    <button className="room-load-error-retry" type="button" onClick={onRetry}>Reintentar</button>
  </article>;
}

function EmptyRoomsState({ onCreate }: { onCreate: () => void }) {
  return <article className="room-empty-state">
    <div className="room-empty-state-icon" aria-hidden="true"><img src="/assets/figma/add-room.svg" alt="" /></div>
    <h3 className="room-empty-state-title">No tienes salas</h3>
    <p className="room-empty-state-description">Cuando crees una sala, aparecerá aquí.</p>
    <button className="room-empty-state-action" type="button" onClick={onCreate}>Crear mi primera sala</button>
  </article>;
}

function JoinRoomDialog({ onClose, onJoined }: { onClose: () => void; onJoined: (room: Room) => void }) {
  const modal = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const element = modal.current;
    if (element && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.open = true;
    }
  }, []);

  function close() {
    if (typeof modal.current?.close === 'function') modal.current.close();
    onClose();
  }

  function handleBusyChange(nextBusy: boolean) {
    busyRef.current = nextBusy;
    setBusy(nextBusy);
  }

  function cancel(event: FormEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!busyRef.current) close();
  }

  return (
    <dialog
      ref={modal}
      onCancel={cancel}
      className={`room-management-dialog room-operation-dialog room-management-dialog-join${invalid ? ' room-management-dialog-join-error' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-room-title"
      aria-describedby="manage-room-description"
      aria-busy={busy}
    >
      <h2 id="manage-room-title">Unirse a sala</h2>
      <p className="room-management-dialog-description" id="manage-room-description">
        Ingresa únicamente el ID de la sala que te compartieron.
      </p>
      <JoinRoomForm
        inputId="manage-room-input"
        errorId="manage-room-error"
        autoFocus
        onInvalidChange={setInvalid}
        onBusyChange={handleBusyChange}
        cancelAction={
          <button className="button secondary" type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
        }
        onJoined={room => {
          if (typeof modal.current?.close === 'function') modal.current.close();
          onJoined(room);
        }}
      />
    </dialog>
  );
}

function RoomManagementDialog({ dialog, onClose, onSave, onDelete }: {
  dialog: Extract<RoomDialogState, { kind: 'edit' | 'delete' }>;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const loadingLabel = {
    edit: ['Guardando cambios…', 'Actualizando el nombre de la sala.'],
    delete: ['Eliminando sala…', 'Retirando la sala del listado.'],
  }[dialog.kind];
  const errorHeading = {
    edit: 'No pudimos guardar los cambios',
    delete: 'No pudimos eliminar la sala',
  }[dialog.kind];

  async function submit(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback('');
    try {
      await action();
    } catch (error) {
      setFeedback(roomError(error, 'No pudimos completar la operación. Inténtalo de nuevo.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function cancel(event: FormEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!pending.current) close();
  }

  function close() {
    if (typeof modal.current?.close === 'function') modal.current.close();
    onClose();
  }

  const notice = busy ? <div className="room-management-status" role="status">
    <strong>{loadingLabel[0]}</strong>
    <p>{loadingLabel[1]}</p>
  </div> : feedback && <div className="room-management-status" role="alert">
    <strong>{errorHeading}</strong>
    <p>{feedback}</p>
  </div>;
  useEffect(() => {
    const element = modal.current;
    if (element && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.open = true;
    }
    (dialog.kind === 'delete' ? cancelButtonRef.current : input.current)?.focus();
  }, [dialog]);

  if (dialog.kind === 'edit') {
    return <dialog ref={modal} onCancel={cancel}
      className={`room-management-dialog room-operation-dialog room-management-dialog-edit${invalid ? ' room-management-dialog-edit-error' : ''}`} role="dialog" aria-modal="true" aria-labelledby="manage-room-title" aria-describedby="manage-room-description" aria-busy={busy}>
        <h2 id="manage-room-title">Editar sala</h2>
        <p className="room-management-dialog-description" id="manage-room-description">
          Actualiza el nombre de tu sala. Los cambios se aplicarán a todos sus participantes.
        </p>
        <form noValidate onSubmit={event => {
          event.preventDefault();
          const value = input.current?.value.trim() ?? '';
          if (!value) { setInvalid(true); input.current?.focus(); return; }
          void submit(() => onSave(value));
        }}>
          <div className="form-field">
            <label htmlFor="manage-room-input">Nombre de la sala</label>
            <input id="manage-room-input" ref={input} defaultValue={dialog.room.name}
              disabled={busy} aria-invalid={invalid} aria-describedby={invalid ? 'manage-room-error' : undefined}
              onChange={() => { setInvalid(false); setFeedback(''); }} />
          </div>
          {invalid && <p id="manage-room-error" className="room-management-dialog-field-error" role="alert">
            Revisa el nombre de la Sala antes de guardar.
          </p>}
          <div className="form-field room-management-dialog-id-field"><label htmlFor="edit-room-id">ID de la sala</label><input className="room-management-dialog-readonly" id="edit-room-id" value={`${dialog.room.id}  ·  No editable`} readOnly aria-readonly="true" /></div><p className="room-management-dialog-helper">El ID se mantiene igual aunque cambies el nombre.</p>
          {notice}
          <div className="room-management-dialog-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={close}>Cancelar</button>
            <button className="button primary" type="submit" disabled={busy}>Guardar cambios</button>
          </div>
        </form>
    </dialog>;
  }

  return <dialog ref={modal} onCancel={cancel} className="room-management-dialog room-operation-dialog room-management-dialog-delete" role="dialog" aria-modal="true" aria-labelledby="delete-room-title" aria-describedby="delete-room-description delete-room-warning" aria-busy={busy}>
      <h2 id="delete-room-title">¿Eliminar esta sala?</h2>
      <p id="delete-room-description">Vas a eliminar «{dialog.room.name}». La Sala dejará de estar disponible para ti y sus participantes.</p>
      <div className="room-management-dialog-warning" id="delete-room-warning">Esta acción no se puede deshacer.</div>
      {notice}
      <div className="room-management-dialog-actions">
        <button ref={cancelButtonRef} className="button secondary" type="button" disabled={busy} onClick={close}>Cancelar</button>
        <button className="button room-management-dialog-danger" type="button" disabled={busy} onClick={() => void submit(onDelete)}>Eliminar sala</button>
      </div>
  </dialog>;
}

function RoomCard({ room, openMenu, onToggleMenu, onEdit, onDelete, menuButtonRef }: { room: RoomPreview; openMenu: boolean; onToggleMenu: () => void; onEdit: () => void; onDelete: () => void; menuButtonRef: (button: HTMLButtonElement | null) => void }) {
  return <article className="room-card" style={{ '--room-accent': room.accent } as React.CSSProperties}>
    <div className="room-card-accent-clip"><div className="room-card-accent" /></div>
    <div className="room-card-content">
      <div className="room-card-heading">
        <h3>{room.name}</h3>
        <div className="room-card-menu-wrap" data-room-menu>
          <button ref={menuButtonRef} className="room-card-menu-button" type="button" aria-label={`Más opciones de ${room.name}`} aria-haspopup="menu" aria-expanded={openMenu} aria-controls={`room-menu-${room.id}`} onClick={onToggleMenu}>
            <img src="/assets/figma/more-options.svg" alt="" />
          </button>
          {openMenu && <div className="room-card-menu" id={`room-menu-${room.id}`} role="menu">
            <button className="room-card-menu-item" type="button" role="menuitem" onClick={onEdit}>Editar sala</button>
            <div className="room-card-menu-divider" role="separator" />
            <button className="room-card-menu-item room-card-menu-item-danger" type="button" role="menuitem" onClick={onDelete}>Eliminar sala</button>
          </div>}
        </div>
      </div>
      <CopyRoomId id={room.id} />
      {room.participants !== undefined && <p className="room-card-participants">{room.participants} {room.participants === 1 ? 'miembro' : 'miembros'}</p>}
      <Link className="room-card-enter" to={`/salas/${encodeURIComponent(room.id)}`}>Entrar&nbsp; →</Link>
    </div>
  </article>;
}

export function DashboardPage() {
  const uid = useOptionalAuth()?.user?.id;
  return <OwnRoomsDashboard key={uid ?? ''} uid={uid} />;
}

function OwnRoomsDashboard({ uid }: { uid?: string }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [roomList, setRoomList] = useState<RoomPreview[]>([]);
  const [managementDialog, setManagementDialog] = useState<RoomDialogState>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dialogRoomId = useRef<string | null>(null);
  const joinTrigger = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<DashboardStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [partial, setPartial] = useState(false);
  const { state: creation, shared, operation } = useRoomOperation();
  const sequence = useRef(0);
  const listFailed = useRef(false);
  const createdDuringLoad = useRef<Room[]>([]);
  const active = useRef(false);
  useEffect(() => {
    if (managementDialog && (managementDialog.kind === 'edit' || managementDialog.kind === 'delete')) dialogRoomId.current = managementDialog.room.id;
    else if (dialogRoomId.current) {
      menuButtonRefs.current[dialogRoomId.current]?.focus();
      dialogRoomId.current = null;
    }
  }, [managementDialog]);
  useEffect(() => {
    if (!openMenu && !managementDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !managementDialog) setOpenMenu(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (openMenu && event.target instanceof Element && !event.target.closest('[data-room-menu]')) setOpenMenu(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [managementDialog, openMenu]);
  function acceptRooms(rooms: Room[]) {
    const owned = uid ? rooms.filter(room => room.ownerId === uid) : rooms;
    setRoomList(owned.map((item, index) => toPreview(item, index)));
    setStatus(owned.length ? 'success' : 'empty');
  }
  async function loadRooms() {
    const attempt = ++sequence.current;
    if (!partial) createdDuringLoad.current = [];
    if (!partial) setStatus('loading');
    try {
      const data = await api.listRooms();
      if (active.current && attempt === sequence.current) {
        const confirmed = createdDuringLoad.current;
        acceptRooms([...confirmed.filter(created => !data.some(room => room.id === created.id)), ...data]);
        listFailed.current = false;
        setPartial(false);
      }
    } catch (error) {
      if (active.current && attempt === sequence.current) {
        listFailed.current = true;
        if (createdDuringLoad.current.length || partial) { setPartial(true); return; }
        setLoadError(roomError(error, 'No fue posible obtener la lista de salas. Comprueba tu conexión e inténtalo de nuevo.'));
        setStatus('error');
      }
    }
  }
  useEffect(() => {
    active.current = true;
    void loadRooms();
    return () => { active.current = false; sequence.current++; };
  }, [uid]);

  async function handleSaveRoom(name: string) {
    if (managementDialog?.kind !== 'edit') return;
    const updated = await api.updateRoom(managementDialog.room.id, { name });
    if (!active.current) return;
    setRoomList(current => current.map((room, index) => room.id === updated.id ? { ...room, ...toPreview(updated, index) } : room));
    setManagementDialog(null);
  }

  function handleCreateRoom(room: Room) {
    createdDuringLoad.current = [room, ...createdDuringLoad.current.filter(item => item.id !== room.id)];
    if (listFailed.current) setPartial(true);
    setRoomList(current => [room, ...current.filter(item => item.id !== room.id)].map((item, index) => toPreview(item, index)));
    setStatus('success');
  }
  useEffect(() => {
    if (!shared) return;
    if (creation.phase === 'created') handleCreateRoom(creation.room);
    if (creation.phase === 'reviewed') {
      sequence.current++;
      acceptRooms(creation.rooms);
      listFailed.current = false;
      setPartial(false);
    }
  }, [creation, shared]);
  const navigate = useNavigate();
  function handleJoinRoom(room: Room) {
    if (!active.current) return;
    setManagementDialog(null);
    navigate(`/salas/${encodeURIComponent(room.id)}`);
  }

  async function handleDeleteRoom() {
    if (managementDialog?.kind !== 'delete') return;
    const { id } = managementDialog.room;
    await api.deleteRoom(id);
    if (!active.current) return;
    if (creation.phase === 'created' && creation.room.id === id) operation.set({ phase: 'idle' });
    setRoomList(current => current.filter(room => room.id !== id));
    setManagementDialog(null);
  }
  const loading = status === 'loading';
  const error = status === 'error';
  return <section className="dashboard">
    <div className="dashboard-heading">
      <div><PageTitle title="Tus salas" /><p>Continúa donde lo dejaste o crea una sala para tu próximo encuentro.</p></div>
      <div className="actions"><button className="button primary" type="button" onClick={() => setManagementDialog({ kind: 'create' })}>＋ Crear sala</button><button ref={joinTrigger} className="button secondary" type="button" onClick={() => setManagementDialog({ kind: 'join' })}>＋ Unirse a sala</button></div>
    </div>
    <section className="rooms-section" data-state={status} aria-labelledby="recent-rooms-title" aria-busy={loading}>
      <div className="rooms-section-heading"><h2 id="recent-rooms-title">Salas recientes</h2>{status === 'success' && roomList.length > 0 && <span>{roomList.length} {roomList.length === 1 ? 'sala' : 'salas'}</span>}</div>
      {partial && <p className="room-create-alert" role="status">No pudimos actualizar el listado completo.{' '}
        <button className="button secondary" type="button" onClick={() => void loadRooms()}>Reintentar</button>
      </p>}
      {loading ? <>
        <div className="dashboard-loading" role="status" aria-live="polite"><span className="dashboard-loading-badge">CARGANDO</span><p>Estamos obteniendo tus salas. Esto puede tardar unos segundos.</p></div>
        <div className="rooms-grid room-skeleton-grid">{['#2857c5', '#0f766e', '#7c3aed', '#7c3aed'].map((accent, index) => <RoomCardSkeleton key={`${accent}-${index}`} accent={accent} />)}</div>
      </> : error ? <RoomLoadError onRetry={() => void loadRooms()} message={loadError || 'No pudimos completar la operación.'} /> : status === 'empty' || roomList.length === 0 ? <EmptyRoomsState onCreate={() => setManagementDialog({ kind: 'create' })} /> : <div className="rooms-grid" data-room-count={roomList.length}>{roomList.map(room => <RoomCard key={room.id} room={room} openMenu={openMenu === room.id} onToggleMenu={() => setOpenMenu(current => current === room.id ? null : room.id)} onEdit={() => { setOpenMenu(null); setManagementDialog({ kind: 'edit', room }); }} onDelete={() => { setOpenMenu(null); setManagementDialog({ kind: 'delete', room }); }} menuButtonRef={button => { menuButtonRefs.current[room.id] = button; }} />)}</div>}
    </section>
    <p className="private-note"><img src="/assets/figma/status-dot.svg" alt="" /> Comparte el ID solo con las personas invitadas.</p>
    {managementDialog?.kind === 'create' && <RoomCreation dialog onClose={() => setManagementDialog(null)} onCreated={handleCreateRoom} onReviewed={rooms => { sequence.current++; acceptRooms(rooms); setPartial(false); }} />}
    {managementDialog?.kind === 'join' && <JoinRoomDialog onClose={() => {
      joinTrigger.current?.focus();
      setManagementDialog(null);
    }} onJoined={handleJoinRoom} />}
    {managementDialog && (managementDialog.kind === 'edit' || managementDialog.kind === 'delete') && <RoomManagementDialog dialog={managementDialog} onClose={() => setManagementDialog(null)} onSave={handleSaveRoom} onDelete={handleDeleteRoom} />}
  </section>;
}
