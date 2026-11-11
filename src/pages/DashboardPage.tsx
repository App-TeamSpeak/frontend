import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';

type RoomPreview = {
  id: string;
  name: string;
  activity: string;
  participants: number;
  connected: number;
  accent: string;
};

type DashboardStatus = 'loading' | 'success' | 'error' | 'empty';
type RoomDialogState = { kind: 'create' } | { kind: 'join' } | { kind: 'edit'; room: RoomPreview } | { kind: 'delete'; room: RoomPreview } | null;

const rooms: RoomPreview[] = [
  { id: 'CALC-8F2K', name: 'Cálculo II · Grupo A', activity: 'Última actividad hace 10 min', participants: 4, connected: 3, accent: '#2857c5' },
  { id: 'ARQ-4M7P', name: 'Arquitectura de software', activity: 'Última actividad ayer', participants: 6, connected: 2, accent: '#0f766e' },
  { id: 'EST-2Q9L', name: 'Proyecto de estructuras', activity: 'Última actividad hace 3 días', participants: 3, connected: 1, accent: '#7c3aed' },
];

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

function RoomLoadError({ onRetry }: { onRetry: () => void }) {
  return <article className="room-load-error" role="alert" aria-live="assertive">
    <div className="room-load-error-icon" aria-hidden="true">
      <img src="/assets/figma/error-state.svg" alt="" />
      <span>!</span>
    </div>
    <h3 className="room-load-error-title">No pudimos cargar tus salas</h3>
    <p className="room-load-error-description">No fue posible obtener la lista de salas. Comprueba tu conexión a internet e inténtalo de nuevo.</p>
    <button className="room-load-error-retry" type="button" onClick={onRetry}>Reintentar</button>
  </article>;
}

function EmptyRoomsState({ onCreate }: { onCreate: () => void }) {
  return <article className="room-empty-state">
    <div className="room-empty-state-icon" aria-hidden="true"><img src="/assets/figma/add-room.svg" alt="" /></div>
    <h3 className="room-empty-state-title">No tienes salas</h3>
    <p className="room-empty-state-description">Cuando crees una sala o te unas con un ID, aparecerá aquí.</p>
    <button className="room-empty-state-action" type="button" onClick={onCreate}>Crear mi primera sala</button>
  </article>;
}

function RoomManagementDialog({ dialog, onClose, onCreate, onSave, onDelete, onJoin }: { dialog: Exclude<RoomDialogState, null>; onClose: () => void; onCreate: (name: string, privacy: string) => void; onSave: (name: string) => void; onDelete: () => void; onJoin: (id: string) => void }) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [editError, setEditError] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [joinError, setJoinError] = useState<'empty' | 'invalid' | null>(null);
  const [privacy, setPrivacy] = useState('private');
  const [joinId, setJoinId] = useState('');

  useEffect(() => {
    setEditError(false);
    setCreateError(false);
    setJoinError(null);
    setPrivacy('private');
    setJoinId('');
    if (dialog.kind === 'edit' || dialog.kind === 'create' || dialog.kind === 'join') nameInputRef.current?.focus();
    else cancelButtonRef.current?.focus();
  }, [dialog.kind, dialog.kind === 'edit' ? dialog.room.id : null]);

  if (dialog.kind === 'edit' || dialog.kind === 'create' || dialog.kind === 'join') {
    const isCreate = dialog.kind === 'create';
    const isJoin = dialog.kind === 'join';
    const room = dialog.kind === 'edit' ? dialog.room : null;
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const rawName = isJoin ? joinId : nameInputRef.current?.value ?? '';
      const name = rawName.trim();
      if (!name) {
        if (isCreate) setCreateError(true);
        else if (isJoin) setJoinError('empty');
        else if (!isJoin) setEditError(true);
        nameInputRef.current?.focus();
        return;
      }
      if (isJoin && !/^[A-Z0-9]{3,6}-[A-Z0-9]{4}$/i.test(name)) {
        setJoinError('invalid');
        nameInputRef.current?.focus();
        return;
      }
      if (isCreate) onCreate(name, privacy);
      else if (isJoin) onJoin(name);
      else onSave(name);
    };

    return <div className="room-management-dialog-backdrop">
      <div className={`room-management-dialog${isCreate ? ` room-management-dialog-create${createError ? ' room-management-dialog-create-error' : ''}` : isJoin ? ` room-management-dialog-join${joinError ? ' room-management-dialog-join-error' : ''}` : ` room-management-dialog-edit${editError ? ' room-management-dialog-edit-error' : ''}`}`} role="dialog" aria-modal="true" aria-labelledby={isCreate ? 'create-room-title' : isJoin ? 'join-room-title' : 'edit-room-title'} aria-describedby={isCreate ? 'create-room-description' : isJoin ? 'join-room-description' : 'edit-room-description'}>
        <h2 id={isCreate ? 'create-room-title' : isJoin ? 'join-room-title' : 'edit-room-title'}>{isCreate ? 'Crear sala' : isJoin ? 'Unirse a sala' : 'Editar sala'}</h2>
        <p className="room-management-dialog-description" id={isCreate ? 'create-room-description' : isJoin ? 'join-room-description' : 'edit-room-description'}>{isCreate ? 'Configura una sala privada para tu grupo de estudio.' : isJoin ? 'Ingresa únicamente el ID de la sala que te compartieron.' : 'Actualiza el nombre de tu sala. Los cambios se aplicarán a todos sus participantes.'}</p>
        <form noValidate onSubmit={handleSubmit}>
          <div className="form-field"><label htmlFor={isCreate ? 'create-room-name' : isJoin ? 'join-room-id' : 'edit-room-name'}>{isJoin ? 'ID de la sala' : 'Nombre de la sala'}</label><input ref={nameInputRef} id={isCreate ? 'create-room-name' : isJoin ? 'join-room-id' : 'edit-room-name'} defaultValue={room?.name ?? ''} value={isJoin ? joinId : undefined} placeholder={isCreate ? 'Ej. Física · Grupo de laboratorio' : isJoin ? 'Ej. CALC-8F2K' : undefined} required={isCreate} aria-invalid={isJoin ? (joinError ? 'true' : undefined) : (isCreate ? (createError ? 'true' : undefined) : (editError ? 'true' : undefined))} aria-describedby={isJoin ? (joinError ? 'join-room-error' : undefined) : (isCreate ? (createError ? 'create-room-error' : undefined) : (editError ? 'edit-room-error' : undefined))} onChange={event => { if (isJoin) { setJoinId(event.target.value); setJoinError(null); } else if (isCreate) setCreateError(false); else setEditError(false); }} /></div>
          {isCreate && createError && <p className="room-management-dialog-field-error" id="create-room-error">Ingresa el nombre de la Sala</p>}
          {isJoin && joinError && <p className="room-management-dialog-field-error" id="join-room-error">{joinError === 'empty' ? 'Ingresa el código de la Sala para continuar' : 'El código ingresado no tiene un formato válido'}</p>}
          {!isCreate && editError && <p className="room-management-dialog-field-error" id="edit-room-error">Revisa el nombre de la Sala antes de guardar.</p>}
          {!isCreate && room && <><div className="form-field room-management-dialog-id-field"><label htmlFor="edit-room-id">ID de la sala</label><input className="room-management-dialog-readonly" id="edit-room-id" value={`${room.id}  ·  No editable`} readOnly aria-readonly="true" /></div><p className="room-management-dialog-helper">El ID se mantiene igual aunque cambies el nombre.</p></>}
          {isJoin && <p className="room-management-dialog-helper room-management-dialog-join-helper">No necesitas correo, nombre ni contraseña para unirte desde aquí.</p>}
          {isCreate && <fieldset className="room-privacy-group"><legend>Privacidad</legend><div className="room-privacy-options">
            <label className={`room-privacy-option${privacy === 'private' ? ' room-privacy-option-selected' : ''}`}>
              <input className="room-privacy-radio" type="radio" name="privacy" value="private" checked={privacy === 'private'} onChange={() => setPrivacy('private')} />
              <span className="room-privacy-copy"><span className="room-privacy-label">Privada</span><span className="room-privacy-description">Solo quienes tengan el ID pueden unirse.</span></span>
            </label>
            <label className={`room-privacy-option${privacy === 'public' ? ' room-privacy-option-selected' : ''}`}>
              <input className="room-privacy-radio" type="radio" name="privacy" value="public" checked={privacy === 'public'} onChange={() => setPrivacy('public')} />
              <span className="room-privacy-copy"><span className="room-privacy-label">Pública</span><span className="room-privacy-description">Cualquier persona con el enlace puede unirse.</span></span>
            </label>
          </div></fieldset>}
          <div className="room-management-dialog-actions"><button ref={cancelButtonRef} className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">{isCreate ? 'Crear sala' : isJoin ? 'Unirse a la sala' : 'Guardar cambios'}</button></div>
        </form>
      </div>
    </div>;
  }

  return <div className="room-management-dialog-backdrop">
    <div className="room-management-dialog room-management-dialog-delete" role="dialog" aria-modal="true" aria-labelledby="delete-room-title" aria-describedby="delete-room-description delete-room-warning">
      <h2 id="delete-room-title">¿Eliminar esta sala?</h2>
      <p id="delete-room-description">Vas a eliminar «{dialog.room.name}». La Sala dejará de estar disponible para ti y sus participantes.</p>
      <div className="room-management-dialog-warning" id="delete-room-warning">Esta acción no se puede deshacer.</div>
      <div className="room-management-dialog-actions"><button ref={cancelButtonRef} className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button room-management-dialog-danger" type="button" onClick={onDelete}>Eliminar sala</button></div>
    </div>
  </div>;
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
      <p className="room-card-activity">Privada · {room.activity}</p>
      <p className="room-card-id">ID&nbsp;&nbsp;{room.id}</p>
      <p className="room-card-participants">{room.participants} participantes</p>
      <div className="room-card-live"><img src="/assets/figma/status-dot.svg" alt="" /> <span>{room.connected} {room.connected === 1 ? 'persona conectada' : 'personas conectadas'} ahora</span></div>
      <Link className="room-card-enter" to={`/salas/${room.id}`}>Entrar&nbsp; →</Link>
    </div>
  </article>;
}

export function DashboardPage() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [roomList, setRoomList] = useState<RoomPreview[]>(rooms);
  const [managementDialog, setManagementDialog] = useState<RoomDialogState>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dialogRoomId = useRef<string | null>(null);
  const [searchParams] = useSearchParams();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<DashboardStatus>('loading');
  const shouldSimulateError = searchParams.get('state') === 'error';
  const shouldSimulateEmpty = searchParams.get('state') === 'empty';
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
      if (event.key === 'Escape') {
        if (managementDialog) setManagementDialog(null);
        else setOpenMenu(null);
      }
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
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (loadAttempt === 0 && shouldSimulateError) {
        setStatus('error');
      } else if (loadAttempt === 0 && shouldSimulateEmpty) {
        setStatus('empty');
      } else {
        setStatus('success');
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [loadAttempt, shouldSimulateEmpty, shouldSimulateError]);
  const handleRetry = () => {
    setStatus('loading');
    setLoadAttempt(attempt => attempt + 1);
  };
  const handleSaveRoom = (name: string) => {
    if (!managementDialog || managementDialog.kind !== 'edit') return;
    setRoomList(current => current.map(room => room.id === managementDialog.room.id ? { ...room, name } : room));
    setManagementDialog(null);
  };
  const handleCreateRoom = (name: string, privacy: string) => {
    setRoomList(current => [...current, { id: `NUE-${String(current.length + 1).padStart(3, '0')}`, name, activity: 'Última actividad ahora', participants: 1, connected: 1, accent: privacy === 'public' ? '#0f766e' : '#2857c5' }]);
    setStatus('success');
    setManagementDialog(null);
  };
  const navigate = useNavigate();
  const handleJoinRoom = (id: string) => {
    setManagementDialog(null);
    navigate(`/salas/${encodeURIComponent(id)}`);
  };
  const handleDeleteRoom = () => {
    if (!managementDialog || managementDialog.kind !== 'delete') return;
    setRoomList(current => current.filter(room => room.id !== managementDialog.room.id));
    setManagementDialog(null);
  };
  const loading = status === 'loading';
  const error = status === 'error';
  return <section className="dashboard">
    <div className="dashboard-heading">
      <div><PageTitle title="Tus salas" /><p>Continúa donde lo dejaste o crea una sala para tu próximo encuentro.</p></div>
      <div className="actions"><button className="button primary" type="button" onClick={() => setManagementDialog({ kind: 'create' })}>＋ Crear sala</button><button className="button secondary" type="button" onClick={() => setManagementDialog({ kind: 'join' })}>＋ Unirse a sala</button></div>
    </div>
    <section className="rooms-section" aria-labelledby="recent-rooms-title" aria-busy={loading}>
      <div className="rooms-section-heading"><h2 id="recent-rooms-title">Salas recientes</h2>{status === 'success' && roomList.length > 0 && <span>{roomList.length} {roomList.length === 1 ? 'sala' : 'salas'}</span>}</div>
      {loading ? <>
        <div className="dashboard-loading" role="status" aria-live="polite"><span className="dashboard-loading-badge">CARGANDO</span><p>Estamos obteniendo tus salas. Esto puede tardar unos segundos.</p></div>
        <div className="rooms-grid room-skeleton-grid">{['#2857c5', '#0f766e', '#7c3aed', '#7c3aed'].map((accent, index) => <RoomCardSkeleton key={`${accent}-${index}`} accent={accent} />)}</div>
      </> : error ? <RoomLoadError onRetry={handleRetry} /> : status === 'empty' || roomList.length === 0 ? <EmptyRoomsState onCreate={() => setManagementDialog({ kind: 'create' })} /> : <div className="rooms-grid" data-room-count={roomList.length}>{roomList.map(room => <RoomCard key={room.id} room={room} openMenu={openMenu === room.id} onToggleMenu={() => setOpenMenu(current => current === room.id ? null : room.id)} onEdit={() => { setOpenMenu(null); setManagementDialog({ kind: 'edit', room }); }} onDelete={() => { setOpenMenu(null); setManagementDialog({ kind: 'delete', room }); }} menuButtonRef={button => { menuButtonRefs.current[room.id] = button; }} />)}</div>}
    </section>
    <p className="private-note"><img src="/assets/figma/status-dot.svg" alt="" /> Acceso privado · Comparte el ID de una sala solo con quienes deban participar.</p>
    {managementDialog && <RoomManagementDialog dialog={managementDialog} onClose={() => setManagementDialog(null)} onCreate={handleCreateRoom} onSave={handleSaveRoom} onDelete={handleDeleteRoom} onJoin={handleJoinRoom} />}
  </section>;
}
