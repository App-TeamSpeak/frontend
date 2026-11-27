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
    <form className="mt-[42px] max-md:mt-7" noValidate onSubmit={handleSubmit} aria-busy={busy}>
      <div className="m-0">
        <label className="mb-2 block text-sm leading-[18px] font-medium" htmlFor={inputId}>ID de la sala</label>
        <input
          className="h-[54px] max-md:h-[51px] w-full rounded-[9px] border border-input-border bg-surface px-4 py-3 text-text placeholder:text-muted placeholder:opacity-100 aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-error-strong"
          id={inputId}
          ref={inputRef}
          placeholder="Ej. CALC-8F2K"
          disabled={busy}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? errorId : undefined}
          onChange={handleChange}
        />
      </div>
      <div className="min-h-[68px] pt-1.5 max-md:min-h-[84px]">
        {fieldError && (
          <p id={errorId} className="m-0 text-[13px] leading-[19px] text-error" role="alert">
            {fieldError}
          </p>
        )}
        <p className={`room-management-dialog-join-helper ${fieldError ? 'mt-[18px]' : 'mt-1.5'} text-xs leading-4 text-muted max-md:[overflow-wrap:anywhere]`}>
          No necesitas correo, nombre ni contraseña para unirte desde aquí.
        </p>
      </div>
      {busy ? (
        <div className="room-management-status mt-4 rounded-xl border border-[#355d95] bg-surface-soft px-4 py-[11px] text-text max-md:min-h-[74px] [&_strong]:block [&_strong]:font-['Inter_Variable',sans-serif] [&_strong]:text-[15px] [&_strong]:leading-5 [&_strong]:font-semibold [&_p]:mt-1.5 [&_p]:text-[13px] [&_p]:leading-[18px] [&_p]:text-muted" role="status">
          <strong>Uniéndote a la sala…</strong>
          <p>Comprobando el ID de la sala.</p>
        </div>
      ) : (
        apiError && (
          <div className="room-management-status mt-4 rounded-xl border border-[#995360] bg-[#3a202b] px-4 py-[11px] text-error max-md:min-h-[74px] [&_strong]:block [&_strong]:font-['Inter_Variable',sans-serif] [&_strong]:text-[15px] [&_strong]:leading-5 [&_strong]:font-semibold [&_strong]:text-error [&_p]:mt-1.5 [&_p]:text-[13px] [&_p]:leading-[18px] [&_p]:text-muted" role="alert">
            <strong>No pudimos unirte</strong>
            <p>{apiError}</p>
          </div>
        )
      )}
      <div className="room-management-dialog-actions mt-4 flex justify-end gap-3 max-md:flex-row max-md:gap-[13px]">
        {cancelAction}
        <button
          className="inline-flex h-12 min-h-[48px] w-[164px] items-center justify-center gap-3 rounded-[10px] border border-link bg-primary px-4 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-text cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:not-disabled:bg-primary-hover active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:opacity-60! max-md:h-auto max-md:min-h-[46px] max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:rounded-[9px] max-md:px-2 max-md:text-center max-md:whitespace-normal"
          type="submit"
          disabled={busy}
        >
          Unirse a la sala
        </button>
      </div>
    </form>
  );
}
