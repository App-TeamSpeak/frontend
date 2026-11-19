import { useId, useRef } from 'react';

export function AccountDeletionDialog() {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  function open() {
    if (confirmation.current) confirmation.current.checked = false;
    dialog.current?.showModal();
    cancel.current?.focus();
  }

  return <>
    <button ref={trigger} className="button room-management-dialog-danger" type="button"
      onClick={open}>Eliminar cuenta</button>
    <dialog ref={dialog} className="room-management-dialog user-profile-dialog profile-delete-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-warning ${id}-availability`}
      onClose={() => trigger.current?.focus()}>
      <h2 id={`${id}-title`}>Eliminar cuenta</h2>
      <p id={`${id}-warning`}>Si eliminas tu cuenta, perderás el acceso a TeamSpeak con esta cuenta. Lee la advertencia antes de confirmar.</p>
      <label className="profile-delete-confirmation">
        <input ref={confirmation} type="checkbox" />
        <span>Entiendo las consecuencias de eliminar mi cuenta</span>
      </label>
      <p id={`${id}-availability`} className="profile-delete-availability">
        La eliminación de cuentas todavía no está disponible. Estamos trabajando para habilitar esta función de forma segura.
      </p>
      <div className="room-management-dialog-actions">
        <button ref={cancel} className="button secondary" type="button"
          onClick={() => dialog.current?.close()}>Cancelar</button>
        <button className="button room-management-dialog-danger" type="button" disabled
          aria-describedby={`${id}-availability`}>Eliminar mi cuenta</button>
      </div>
    </dialog>
  </>;
}
