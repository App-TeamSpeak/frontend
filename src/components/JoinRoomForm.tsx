import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type Room } from '../services/api';
import { roomError } from '../utils/roomError';
import { validateRoomId } from '../utils/roomId';

export type JoinRoomFormProps = {
  inputId: string;
  errorId: string;
  autoFocus?: boolean;
  cancelAction: ReactNode;
  onJoined: (room: Room) => void;
  onInvalidChange?: (invalid: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
};

function joinApiError(error: unknown) {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    return 'El código ingresado no tiene un formato válido';
  }
  return roomError(error, 'No pudimos completar la operación. Inténtalo de nuevo.');
}

/**
 * Formulario reutilizable para unirse a una sala mediante su identificador.
 */
export function JoinRoomForm({
  inputId,
  errorId,
  autoFocus = false,
  cancelAction,
  onJoined,
  onInvalidChange,
  onBusyChange,
}: JoinRoomFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const focusAfterError = useRef(false);
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    active.current = true;
    if (autoFocus) inputRef.current?.focus();
    return () => {
      active.current = false;
    };
  }, [autoFocus]);

  useEffect(() => {
    if (focusAfterError.current && !busy && apiError && active.current) {
      focusAfterError.current = false;
      inputRef.current?.focus();
    }
  }, [busy, apiError]);

  function handleChange() {
    if (fieldError) {
      setFieldError('');
      onInvalidChange?.(false);
    }
    if (apiError) setApiError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;

    const validation = validateRoomId(inputRef.current?.value ?? '');
    if (!validation.ok) {
      setFieldError(validation.message);
      setApiError('');
      onInvalidChange?.(true);
      inputRef.current?.focus();
      return;
    }

    pending.current = true;
    focusAfterError.current = false;
    setBusy(true);
    onBusyChange?.(true);
    setFieldError('');
    setApiError('');
    onInvalidChange?.(false);

    try {
      const room = await api.joinRoom(validation.roomId);
      if (active.current) onJoined(room);
    } catch (error) {
      if (active.current) {
        focusAfterError.current = true;
        setApiError(joinApiError(error));
      }
    } finally {
      pending.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={busy}>
      <div className="form-field">
        <label htmlFor={inputId}>ID de la sala</label>
        <input
          id={inputId}
          ref={inputRef}
          placeholder="Ej. CALC-8F2K"
          disabled={busy}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? errorId : undefined}
          onChange={handleChange}
        />
      </div>
      {fieldError && (
        <p id={errorId} className="room-management-dialog-field-error" role="alert">
          {fieldError}
        </p>
      )}
      <p className="room-management-dialog-helper room-management-dialog-join-helper">
        No necesitas correo, nombre ni contraseña para unirte desde aquí.
      </p>
      {busy ? (
        <div className="room-management-status" role="status">
          <strong>Uniéndote a la sala…</strong>
          <p>Comprobando el ID de la sala.</p>
        </div>
      ) : (
        apiError && (
          <div className="room-management-status" role="alert">
            <strong>No pudimos unirte</strong>
            <p>{apiError}</p>
          </div>
        )
      )}
      <div className="room-management-dialog-actions">
        {cancelAction}
        <button className="button primary" type="submit" disabled={busy}>
          Unirse a la sala
        </button>
      </div>
    </form>
  );
}
