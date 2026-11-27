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
const ROOMS_POLL_INTERVAL_MS = 10_000;
const ROOMS_REVALIDATE_GAP_MS = 1_500;
function toPreview(room: Room, index: number): RoomPreview { return { ...room, accent: accents[index % accents.length] }; }

function formatRoomActivity(room: Pick<Room, 'lastActivityAt' | 'createdAt'>): string | null {
  const value = room.lastActivityAt ?? room.createdAt;
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'Última actividad hace un momento';
  if (minutes < 60) return `Última actividad hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Última actividad hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'Última actividad hace 1 día' : `Última actividad hace ${days} días`;
  return `Última actividad · ${new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(timestamp)}`;
}

function RoomCardSkeleton({ accent }: { accent: string }) {
  return <article className="room-card-skeleton min-h-[220px] max-md:min-h-0 overflow-hidden rounded-[18px] max-md:rounded-[15px] border border-border-strong bg-[linear-gradient(to_bottom,var(--room-accent)_0_5px,#111827_5px)] max-md:bg-none max-md:bg-surface max-md:[&:nth-child(n+3)]:hidden" style={{ '--room-accent': accent } as React.CSSProperties} aria-hidden="true">
    <div className="h-[5px] w-full max-md:hidden" />
    <div className="flex min-h-[215px] flex-col px-[23px] py-[29px] max-md:min-h-[147px] max-md:gap-4 max-md:p-[19px]">
      <span className="skeleton-block skeleton-shimmer h-[18px] w-[48%] rounded-[6px] max-md:h-3" />
      <span className="skeleton-block skeleton-shimmer mt-[22px] h-3 w-[35%] rounded-[5px] max-md:mt-0 max-md:w-[80%]" />
      <span className="skeleton-block skeleton-shimmer mt-[22px] h-[9px] w-[22%] max-md:mt-0 max-md:h-3 max-md:w-[40%]" />
      <span className="skeleton-block skeleton-shimmer mt-[22px] h-[10px] w-[28%] max-md:mt-0 max-md:h-3 max-md:w-[55%]" />
      <span className="mt-7 flex items-center gap-2 max-md:hidden"><span className="h-2 w-2 rounded bg-[#1e4d46]" /><span className="skeleton-block skeleton-shimmer h-[10px] w-[30%]" /></span>
      <span className="skeleton-block skeleton-shimmer mt-auto ml-auto h-[10px] w-[15%] rounded-[5px] max-md:hidden" />
    </div>
  </article>;
}

function RoomLoadError({ onRetry, message }: { onRetry: () => void; message: string }) {
  return <article className="mx-auto mt-[78px] mb-[42px] flex min-h-[380px] w-[min(600px,100%)] flex-col items-center justify-start rounded-[18px] border border-border bg-surface px-8 pt-[76px] pb-8 text-center max-md:my-8 max-md:min-h-0 max-md:w-full max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:text-start">
    <div className="flex flex-col items-center max-md:min-h-[128px] max-md:w-full max-md:items-start max-md:rounded-xl max-md:border max-md:border-error-strong max-md:bg-danger-surface max-md:px-[17px] max-md:py-4" role="alert">
      <div className="relative h-16 w-16 shrink-0 max-md:hidden" aria-hidden="true">
        <img className="block h-16 w-16" src="/assets/figma/error-state.svg" alt="" />
        <span className="absolute inset-0 grid place-items-center font-['Inter_Variable',sans-serif] text-[30px] leading-none font-semibold text-error">!</span>
      </div>
      <h3 className="mt-6 font-['Inter_Variable',sans-serif] text-2xl leading-[30px] font-semibold text-text max-md:mt-0 max-md:text-base max-md:leading-[22px] max-md:text-error">No pudimos cargar tus salas</h3>
      <p className="mt-[14px] max-w-[504px] text-[15px] leading-[21px] text-muted max-md:mt-[10px] max-md:text-sm">{message}</p>
    </div>
    <button className="mt-9 min-h-[48px] w-[168px] rounded-lg border border-link bg-primary px-5 font-['Inter_Variable',sans-serif] text-sm font-semibold text-text cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:not-disabled:bg-primary-hover active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 max-md:mt-[23px] max-md:w-full" type="button" onClick={onRetry}>Reintentar</button>
  </article>;
}

function EmptyRoomsState({ onCreate }: { onCreate: () => void }) {
  return <article className="mx-auto my-[75px] flex min-h-[350px] w-[min(780px,100%)] flex-col items-center justify-start rounded-[24px] border border-border bg-surface px-6 pt-[33px] pb-8 text-center max-md:mt-8 max-md:mb-5 max-md:items-stretch max-md:px-[29px] max-md:pt-[26px] max-md:pb-[31px] max-md:text-start">
    <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-[24px] bg-surface-soft max-md:h-[70px] max-md:w-[70px] max-md:self-center" aria-hidden="true"><img className="block h-9 w-9" src="/assets/figma/add-room.svg" alt="" /></div>
    <h3 className="mt-[26px] font-['Inter_Variable',sans-serif] text-[26px] leading-[31px] font-semibold text-text max-md:mt-[35px]">No tienes salas</h3>
    <p className="mt-[13px] text-[15px] leading-[18px] text-muted max-md:mt-4 max-md:max-w-full max-md:text-sm max-md:leading-5">Cuando crees una sala, aparecerá aquí.</p>
    <button className="mt-10 inline-flex min-h-[52px] w-[360px] items-center justify-center rounded-[10px] border border-link bg-primary px-5 font-['Inter_Variable',sans-serif] text-sm font-semibold text-text cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:not-disabled:bg-primary-hover active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 max-md:mt-8 max-md:min-h-[46px] max-md:w-full" type="button" onClick={onCreate}>Crear mi primera sala</button>
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
      className={`fixed inset-0 m-auto max-w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] overflow-auto [overflow-wrap:anywhere] w-[min(500px,100%)] min-h-[370px] rounded-[20px] border border-border bg-surface px-8 pt-7 pb-5 text-text shadow-[0_24px_64px_var(--dialog-shadow)] backdrop:bg-overlay max-md:w-[min(358px,calc(100%-32px))] max-md:min-h-[min(360px,calc(100dvh-32px))] max-md:rounded-[19px] max-md:px-[23px] max-md:pt-[26px] max-md:pb-6 [&_h2]:text-[26px] [&_h2]:leading-8 max-md:[&_h2]:text-[25px] max-md:[&_h2]:leading-[30px] max-md:[&:has(.room-management-status)]:min-h-[min(416px,calc(100dvh-32px))] max-md:[&:has(.room-management-status)_.room-management-dialog-join-helper]:hidden${invalid ? ' room-management-dialog-join-error' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-room-title"
      aria-describedby="manage-room-description"
      aria-busy={busy}
    >
      <h2 id="manage-room-title">Unirse a sala</h2>
      <p className="mt-3 text-[15px] leading-[21px] text-muted" id="manage-room-description">
        Ingresa únicamente el ID de la sala que te compartieron.
      </p>
      <JoinRoomForm
        inputId="manage-room-input"
        errorId="manage-room-error"
        autoFocus
        onInvalidChange={setInvalid}
        onBusyChange={handleBusyChange}
        cancelAction={
          <button
            className="inline-flex h-12 min-h-[48px] w-[130px] items-center justify-center gap-3 rounded-[10px] border border-border-strong bg-surface px-4 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-link-strong cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:not-disabled:bg-subtle active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:opacity-60! max-md:h-auto max-md:min-h-[46px] max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:rounded-[9px] max-md:px-2 max-md:text-center max-md:whitespace-normal"
            type="button"
            disabled={busy}
            onClick={close}
          >
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

  const statusBase = "mt-4 rounded-xl border px-4 py-[11px] max-md:min-h-[74px] [&_strong]:block [&_strong]:font-['Inter_Variable',sans-serif] [&_strong]:text-[15px] [&_strong]:leading-5 [&_p]:mt-1.5 [&_p]:text-[13px] [&_p]:leading-[18px] [&_p]:text-muted";
  const notice = busy ? <div className={`${statusBase} border-[#355d95] bg-surface-soft text-text`} role="status">
    <strong>{loadingLabel[0]}</strong>
    <p>{loadingLabel[1]}</p>
  </div> : feedback && <div className={`${statusBase} border-[#995360] bg-[#3a202b] text-error [&_strong]:text-error`} role="alert">
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

  const dialogShell = 'fixed inset-0 m-auto max-w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] overflow-auto [overflow-wrap:anywhere] w-[min(500px,100%)] rounded-[20px] border border-border bg-surface px-8 pb-5 text-text shadow-[0_24px_64px_var(--dialog-shadow)] backdrop:bg-overlay max-md:w-[min(358px,calc(100%-32px))] max-md:min-h-0 max-md:rounded-[19px] max-md:px-[23px] max-md:pt-[26px] max-md:pb-6 [&_h2]:text-[26px] [&_h2]:leading-8 max-md:[&_h2]:text-[25px] max-md:[&_h2]:leading-[30px]';
  const dialogBtnBase = "inline-flex h-[44px] min-h-[44px] items-center justify-center gap-3 rounded-[10px] border px-4 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:opacity-60! max-md:h-auto max-md:min-h-[46px] max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:rounded-[9px] max-md:px-2 max-md:text-center max-md:whitespace-normal";

  if (dialog.kind === 'edit') {
    return <dialog ref={modal} onCancel={cancel}
      className={`${dialogShell} pt-7 ${invalid ? 'min-h-[458px]' : 'min-h-[430px]'}`} role="dialog" aria-modal="true" aria-labelledby="manage-room-title" aria-describedby="manage-room-description" aria-busy={busy}>
        <h2 id="manage-room-title">Editar sala</h2>
        <p className="mt-3 text-[15px] leading-[21px] text-muted" id="manage-room-description">
          Actualiza el nombre de tu sala. Los cambios se aplicarán a todos sus participantes.
        </p>
        <form className="mt-6" noValidate onSubmit={event => {
          event.preventDefault();
          const value = input.current?.value.trim() ?? '';
          if (!value) { setInvalid(true); input.current?.focus(); return; }
          void submit(() => onSave(value));
        }}>
          <div className={invalid ? 'mb-0' : 'mb-[22px]'}>
            <label className="mb-2 block text-sm leading-[18px] font-medium" htmlFor="manage-room-input">Nombre de la sala</label>
            <input className="h-[52px] w-full rounded-lg border border-input-border bg-canvas px-4 py-3 text-text aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-error-strong" id="manage-room-input" ref={input} defaultValue={dialog.room.name}
              disabled={busy} aria-invalid={invalid} aria-describedby={invalid ? 'manage-room-error' : undefined}
              onChange={() => { setInvalid(false); setFeedback(''); }} />
          </div>
          {invalid && <p id="manage-room-error" className="mt-1.5 mb-[25px] text-[13px] leading-[19px] text-error [overflow-wrap:anywhere]" role="alert">
            Revisa el nombre de la Sala antes de guardar.
          </p>}
          <div className="mb-0"><label className="mb-2 block text-sm leading-[18px] font-medium" htmlFor="edit-room-id">ID de la sala</label><input className="h-12 w-full rounded-[9px] border border-border bg-stage-active px-4 py-3 text-sm text-muted focus:outline-none focus:shadow-none" id="edit-room-id" value={`${dialog.room.id}  ·  No editable`} readOnly aria-readonly="true" /></div><p className="mt-2 text-xs leading-4 text-disabled-text">El ID se mantiene igual aunque cambies el nombre.</p>
          {notice}
          <div className="mt-5 flex justify-end gap-3 max-md:flex-row max-md:gap-[13px]">
            <button className={`${dialogBtnBase} w-[120px] border-border-strong bg-surface text-link-strong hover:not-disabled:bg-subtle`} type="button" disabled={busy} onClick={close}>Cancelar</button>
            <button className={`${dialogBtnBase} w-[148px] border-link bg-primary px-2 whitespace-nowrap text-text hover:not-disabled:bg-primary-hover`} type="submit" disabled={busy}>Guardar cambios</button>
          </div>
        </form>
    </dialog>;
  }

  return <dialog ref={modal} onCancel={cancel} className={`${dialogShell} min-h-[360px] pt-[27px]`} role="dialog" aria-modal="true" aria-labelledby="delete-room-title" aria-describedby="delete-room-description delete-room-warning" aria-busy={busy}>
      <h2 id="delete-room-title">¿Eliminar esta sala?</h2>
      <p className="mt-3 max-w-[436px] text-[15px] leading-[21px] text-muted" id="delete-room-description">Vas a eliminar «{dialog.room.name}». La Sala dejará de estar disponible para ti y sus participantes.</p>
      <div className="mt-6 max-md:mt-5 flex min-h-16 items-center rounded-[10px] border border-danger-action-hover bg-danger-deep px-[15px] py-5 text-sm leading-5 text-error" id="delete-room-warning">Esta acción no se puede deshacer.</div>
      {notice}
      <div className="mt-[51px] max-md:mt-7 flex justify-end gap-3 max-md:flex-row max-md:gap-[13px]">
        <button ref={cancelButtonRef} className={`${dialogBtnBase} w-[120px] rounded-lg border-2 border-link bg-surface text-text hover:not-disabled:bg-subtle`} type="button" disabled={busy} onClick={close}>Cancelar</button>
        <button className={`${dialogBtnBase} w-[148px] rounded-lg border-error-strong bg-danger-action text-text hover:not-disabled:bg-danger-action-hover`} type="button" disabled={busy} onClick={() => void submit(onDelete)}>Eliminar sala</button>
      </div>
  </dialog>;
}

function RoomCard({ room, openMenu, onToggleMenu, onEdit, onDelete, menuButtonRef }: { room: RoomPreview; openMenu: boolean; onToggleMenu: () => void; onEdit: () => void; onDelete: () => void; menuButtonRef: (button: HTMLButtonElement | null) => void }) {
  const activityLabel = formatRoomActivity(room);
  const connectedCount = typeof room.connected === 'number' && Number.isFinite(room.connected)
    ? Math.max(0, Math.trunc(room.connected))
    : undefined;
  const menuItemBase = "flex min-h-10 w-full items-center border-0 bg-transparent px-[15px] py-[10px] text-left font-['Source_Sans_3_Variable',sans-serif] text-[15px] leading-5 font-normal transition-[background-color,color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";
  return <article className="room-card min-w-0 min-h-[244px] max-md:min-h-[148px] overflow-visible rounded-[20px] max-md:rounded-[15px] border border-border-strong bg-surface [background-image:linear-gradient(to_bottom,var(--room-accent)_0_6px,transparent_6px)] transition-[background-color,border-color] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:border-link [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-soft active:border-link active:bg-canvas focus-within:border-focus-ring focus-within:bg-surface focus-within:outline-2 focus-within:outline-focus-ring" style={{ '--room-accent': room.accent } as React.CSSProperties}>
    <div className="h-[6px] w-full overflow-hidden rounded-t-[19px]" />
    <div className="relative flex min-h-[238px] flex-col gap-3 px-6 pt-[19px] pb-5 max-md:min-h-[142px] max-md:gap-[5px] max-md:px-[17px] max-md:py-3 [&_.room-card-id]:text-xs [&_.room-card-id]:leading-4 [&_.room-card-id]:text-muted">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h3 className="min-w-0 font-['Inter_Variable',sans-serif] text-[20px] max-md:text-lg leading-[1.25] font-semibold [overflow-wrap:anywhere]">{room.name}</h3>
        <div className="relative shrink-0" data-room-menu>
          <button ref={menuButtonRef} className="grid h-8 w-8 place-items-center border-0 bg-transparent p-0 transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-gap)] [&_img]:h-8 [&_img]:w-8" type="button" aria-label={`Más opciones de ${room.name}`} aria-haspopup="menu" aria-expanded={openMenu} aria-controls={`room-menu-${room.id}`} onClick={onToggleMenu}>
            <img src="/assets/figma/more-options.svg" alt="" />
          </button>
          {openMenu && <div className="room-card-menu absolute top-[38px] right-0 z-[3] grid w-[200px] origin-top-right animate-[menu-enter_var(--motion-fast)_var(--ease-standard)] motion-reduce:animate-none rounded-[10px] border border-input-border bg-stage-active py-1 shadow-[0_8px_20px_-4px_rgb(0_0_0_/_28%)]" id={`room-menu-${room.id}`} role="menu">
            <button className={`${menuItemBase} text-text hover:bg-subtle focus-visible:bg-subtle active:bg-canvas`} type="button" role="menuitem" onClick={onEdit}>Editar sala</button>
            <div className="mx-[15px] my-1.5 h-px bg-input-border" role="separator" />
            <button className={`${menuItemBase} text-error hover:bg-danger-surface focus-visible:bg-danger-surface active:bg-danger-deep`} type="button" role="menuitem" onClick={onDelete}>Eliminar sala</button>
          </div>}
        </div>
      </div>
      {activityLabel && <p className="text-sm leading-5 text-muted">{activityLabel}</p>}
      <CopyRoomId id={room.id} compact />
      {room.participants !== undefined && <p className="text-xs leading-4 text-muted">{room.participants} {room.participants === 1 ? 'participante' : 'participantes'}</p>}
      {connectedCount !== undefined && (
        connectedCount > 0 ? (
          <p className="flex items-center gap-2 pt-1 text-xs leading-4 text-success">
            <img className="h-2 w-2 shrink-0" src="/assets/figma/status-dot.svg" alt="" />
            {connectedCount} {connectedCount === 1 ? 'persona conectada ahora' : 'personas conectadas ahora'}
          </p>
        ) : (
          <p className="flex items-center gap-2 pt-1 text-xs leading-4 text-muted">Sin personas conectadas ahora</p>
        )
      )}
      <Link className="mt-auto inline-flex min-h-[34px] items-center self-end font-['Inter_Variable',sans-serif] text-[13px] font-semibold text-link-strong" to={`/salas/${encodeURIComponent(room.id)}`}>Entrar&nbsp; →</Link>
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
  const mutationEpoch = useRef(0);
  const lastRefreshAt = useRef(0);
  const foregroundInFlight = useRef(false);
  const silentController = useRef<AbortController | null>(null);
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
  async function loadRooms(silent = false) {
    if (silent) {
      if (document.visibilityState === 'hidden' || foregroundInFlight.current || silentController.current) return;
      const controller = new AbortController();
      silentController.current = controller;
      lastRefreshAt.current = Date.now();
      const attempt = sequence.current;
      const epoch = mutationEpoch.current;
      try {
        const data = await api.listRooms(controller.signal);
        if (active.current && !controller.signal.aborted && attempt === sequence.current && epoch === mutationEpoch.current) {
          const confirmed = createdDuringLoad.current;
          acceptRooms([...confirmed.filter(created => !data.some(room => room.id === created.id)), ...data]);
          listFailed.current = false;
          setPartial(false);
          lastRefreshAt.current = Date.now();
        }
      } catch {
        // Keep existing cards intact if a background refresh fails transiently.
      } finally {
        if (silentController.current === controller) silentController.current = null;
      }
      return;
    }

    silentController.current?.abort();
    silentController.current = null;
    const attempt = ++sequence.current;
    mutationEpoch.current++;
    foregroundInFlight.current = true;
    lastRefreshAt.current = Date.now();
    if (!partial) createdDuringLoad.current = [];
    if (!partial) setStatus('loading');
    try {
      const data = await api.listRooms();
      if (active.current && attempt === sequence.current) {
        const confirmed = createdDuringLoad.current;
        acceptRooms([...confirmed.filter(created => !data.some(room => room.id === created.id)), ...data]);
        listFailed.current = false;
        setPartial(false);
        lastRefreshAt.current = Date.now();
      }
    } catch (error) {
      if (active.current && attempt === sequence.current) {
        listFailed.current = true;
        if (createdDuringLoad.current.length || partial) { setPartial(true); return; }
        setLoadError(roomError(error, 'No fue posible obtener la lista de salas. Comprueba tu conexión e inténtalo de nuevo.'));
        setStatus('error');
      }
    } finally {
      if (attempt === sequence.current) foregroundInFlight.current = false;
    }
  }
  useEffect(() => {
    active.current = true;
    void loadRooms();
    return () => {
      active.current = false;
      sequence.current++;
      silentController.current?.abort();
      silentController.current = null;
      foregroundInFlight.current = false;
    };
  }, [uid]);
  const pollEnabled = status === 'success' || status === 'empty';
  useEffect(() => {
    if (!pollEnabled) return;
    const revalidate = (respectGap: boolean) => {
      if (document.visibilityState === 'hidden') return;
      if (respectGap && Date.now() - lastRefreshAt.current < ROOMS_REVALIDATE_GAP_MS) return;
      void loadRooms(true);
    };
    const intervalId = window.setInterval(() => revalidate(false), ROOMS_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') revalidate(true);
    };
    const onFocus = () => revalidate(true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [pollEnabled, uid]);

  async function handleSaveRoom(name: string) {
    if (managementDialog?.kind !== 'edit') return;
    const updated = await api.updateRoom(managementDialog.room.id, { name });
    if (!active.current) return;
    mutationEpoch.current++;
    silentController.current?.abort();
    silentController.current = null;
    createdDuringLoad.current = createdDuringLoad.current.map(room => room.id === updated.id ? updated : room);
    setRoomList(current => current.map((room, index) => room.id === updated.id ? { ...room, ...toPreview(updated, index) } : room));
    setManagementDialog(null);
  }

  function handleCreateRoom(room: Room) {
    mutationEpoch.current++;
    silentController.current?.abort();
    silentController.current = null;
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
      mutationEpoch.current++;
      silentController.current?.abort();
      silentController.current = null;
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
    mutationEpoch.current++;
    silentController.current?.abort();
    silentController.current = null;
    createdDuringLoad.current = createdDuringLoad.current.filter(room => room.id !== id);
    if (creation.phase === 'created' && creation.room.id === id) operation.set({ phase: 'idle' });
    setRoomList(current => current.filter(room => room.id !== id));
    setManagementDialog(null);
  }
  const loading = status === 'loading';
  const error = status === 'error';
  const actionBtnBase = "inline-flex min-h-[48px] items-center justify-center gap-3 rounded-[10px] border px-5 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-gap)] active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted disabled:opacity-100! max-md:min-w-0 max-md:min-h-[46px] max-md:px-2 max-md:rounded-[9px]";
  const roomsGridClass = roomList.length === 1
    ? 'grid min-w-0 gap-6 grid-cols-[minmax(0,524px)] max-md:grid-cols-1 max-md:gap-4'
    : roomList.length === 2 || roomList.length === 3
      ? 'grid min-w-0 gap-6 grid-cols-2 max-md:grid-cols-1 max-md:gap-4'
      : 'grid min-w-0 gap-6 grid-cols-3 max-[1100px]:grid-cols-2 max-md:grid-cols-1 max-md:gap-4';
  return <section className="mx-auto max-w-[1136px] px-8 max-md:px-0">
    <div className="flex items-center justify-between gap-6 max-[1100px]:flex-col max-[1100px]:items-start max-md:gap-5">
      <div><PageTitle title="Tus salas" /><p className="mt-1.5 text-muted">Continúa donde lo dejaste o crea una sala para tu próximo encuentro.</p></div>
      <div className="flex flex-wrap gap-3 max-md:grid max-md:w-full max-md:grid-cols-2">
        <button className={`${actionBtnBase} min-w-[176px] border-link bg-primary text-text hover:not-disabled:bg-primary-hover active:not-disabled:bg-primary-hover active:not-disabled:shadow-[inset_0_0_0_1px_var(--link)]`} type="button" onClick={() => setManagementDialog({ kind: 'create' })}>＋ Crear sala</button>
        <button ref={joinTrigger} className={`${actionBtnBase} border-border-strong bg-surface text-link-strong hover:not-disabled:bg-subtle active:not-disabled:bg-canvas active:not-disabled:border-link active:not-disabled:shadow-[inset_0_0_0_1px_var(--link)]`} type="button" onClick={() => setManagementDialog({ kind: 'join' })}>＋ Unirse a sala</button>
      </div>
    </div>
    <section className="mt-[18px]" data-state={status} aria-labelledby="recent-rooms-title" aria-busy={loading}>
      <div className={`mb-4 flex items-center justify-between gap-4 ${(status === 'empty' || status === 'error') ? 'sr-only' : ''}`}><h2 className="text-[20px]" id="recent-rooms-title">Salas recientes</h2>{status === 'success' && roomList.length > 0 && <span className="text-xs text-muted">{roomList.length} {roomList.length === 1 ? 'sala' : 'salas'}</span>}</div>
      {partial && <p className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-[#995360] bg-[#3a202b] px-4 py-3 text-sm leading-5 text-error [overflow-wrap:anywhere]" role="status">No pudimos actualizar el listado completo.{' '}
        <button className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-border-strong bg-surface px-4 py-2 font-['Inter_Variable',sans-serif] text-sm font-semibold text-link-strong hover:bg-subtle" type="button" onClick={() => void loadRooms()}>Reintentar</button>
      </p>}
      {loading ? <>
        <div className="mt-3 mb-4" role="status" aria-live="polite"><span className="inline-flex min-h-7 w-[108px] items-center justify-start rounded-[14px] border border-primary-hover bg-[#172554] px-[9px] font-['Inter_Variable',sans-serif] text-xs font-medium text-link max-md:sr-only">CARGANDO</span><p className="mt-2 text-sm leading-5 text-muted">Estamos obteniendo tus salas. Esto puede tardar unos segundos.</p></div>
        <div className="grid min-w-0 grid-cols-2 gap-6 max-md:grid-cols-1 max-md:gap-4">{['#2857c5', '#0f766e', '#7c3aed', '#7c3aed'].map((accent, index) => <RoomCardSkeleton key={`${accent}-${index}`} accent={accent} />)}</div>
      </> : error ? <RoomLoadError onRetry={() => void loadRooms()} message={loadError || 'No pudimos completar la operación.'} /> : status === 'empty' || roomList.length === 0 ? <EmptyRoomsState onCreate={() => setManagementDialog({ kind: 'create' })} /> : <div className={roomsGridClass} data-room-count={roomList.length}>{roomList.map(room => <RoomCard key={room.id} room={room} openMenu={openMenu === room.id} onToggleMenu={() => setOpenMenu(current => current === room.id ? null : room.id)} onEdit={() => { setOpenMenu(null); setManagementDialog({ kind: 'edit', room }); }} onDelete={() => { setOpenMenu(null); setManagementDialog({ kind: 'delete', room }); }} menuButtonRef={button => { menuButtonRefs.current[room.id] = button; }} />)}</div>}
    </section>
    <p className="mt-6 max-md:mt-5 flex items-center gap-2 text-xs text-muted"><img src="/assets/figma/status-dot.svg" alt="" /> Comparte el ID solo con las personas invitadas.</p>
    {managementDialog?.kind === 'create' && <RoomCreation dialog onClose={() => setManagementDialog(null)} onCreated={handleCreateRoom} onReviewed={rooms => { sequence.current++; acceptRooms(rooms); setPartial(false); }} />}
    {managementDialog?.kind === 'join' && <JoinRoomDialog onClose={() => {
      joinTrigger.current?.focus();
      setManagementDialog(null);
    }} onJoined={handleJoinRoom} />}
    {managementDialog && (managementDialog.kind === 'edit' || managementDialog.kind === 'delete') && <RoomManagementDialog dialog={managementDialog} onClose={() => setManagementDialog(null)} onSave={handleSaveRoom} onDelete={handleDeleteRoom} />}
  </section>;
}
