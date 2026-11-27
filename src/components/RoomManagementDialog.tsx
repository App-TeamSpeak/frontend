import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Room } from '../services/api';
import { roomError } from '../utils/roomError';

export type RoomManagementDialogState = {
  kind: 'edit' | 'delete';
  room: Pick<Room, 'id' | 'name'>;
};

/**
 * Diálogo reutilizable para editar el nombre o eliminar una sala desde el dashboard o dentro de la sala.
 */
export function RoomManagementDialog({ dialog, onClose, onSave, onDelete, errorFallback = 'No pudimos completar la operación. Inténtalo de nuevo.' }: {
  dialog: RoomManagementDialogState;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  errorFallback?: string;
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
      setFeedback(roomError(error, errorFallback));
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
          <input className="h-[52px] w-full rounded-lg border border-input-border bg-canvas px-4 py-3 text-text aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-error-strong" id="manage-room-input" ref={input} maxLength={80} defaultValue={dialog.room.name}
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
