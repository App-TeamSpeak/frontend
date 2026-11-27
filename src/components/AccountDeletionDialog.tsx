import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../services/api';
import { clearAuthProfileCache, currentFirebaseUser, deleteUserAccount, logoutUser, reauthenticateForDeletion } from '../services/auth';

import { clearDeletionTracking, createDeletionToken, lastDeletionIdentity, readDeletionTracking, rememberDeletionIdentity, saveDeletionTracking, type DeletionTracking } from '../services/deletionTracking';

type Phase = 'confirm' | 'reauth' | 'sending' | 'pending' | 'unknown' | 'blocked' | 'completed';
type Attempt = {
  uid: string;
  token?: string;
  started: boolean;
  completed?: boolean;
};
const OpenDeletion = createContext<((trigger: HTMLButtonElement) => void) | null>(null);
const OpenTracking = createContext<{
  uid: string;
  open: (trigger: HTMLButtonElement) => void;
} | null>(null);
const DeletionCompleted = createContext(false);
export function useAccountDeletionCompleted() { return useContext(DeletionCompleted); }

const MAX_AUTOMATIC_CHECKS = 3;
const CHECK_INTERVAL_MS = 3_000;

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

const deleteBtnBase = "inline-flex items-center justify-center gap-3 border font-['Inter_Variable',sans-serif] text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default";

export function AccountDeletionDialog() {
  const open = useContext(OpenDeletion);
  return <button className={`${deleteBtnBase} mx-6 mt-[14px] min-h-[48px] w-[calc(100%-48px)] rounded-[9px] border-error bg-danger-action px-5 py-[10px] text-text hover:not-disabled:bg-danger-action-hover max-[900px]:mx-0 max-[900px]:w-full`} type="button"
    onClick={event => open?.(event.currentTarget)}>Eliminar cuenta</button>;
}

export function AccountDeletionTrackingButton({ uid }: { uid: string }) {
  const tracking = useContext(OpenTracking);
  if (tracking?.uid !== uid) return null;
  return <div className="user-profile-tracking mt-4">
    <button className={`${deleteBtnBase} min-h-[44px] max-w-full rounded-[9px] border-border-strong bg-surface px-5 py-[10px] text-center text-link-strong hover:not-disabled:bg-subtle`} type="button"
      onClick={event => tracking.open(event.currentTarget)}>Ver seguimiento de eliminación</button>
  </div>;
}

export function AccountDeletionProvider({ children }: { children: ReactNode }) {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const operation = useRef(false);
  const checks = useRef(0);
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState('');
  const [localFailure, setLocalFailure] = useState<'logout' | 'navigation'>();

  function current(active: Attempt) {
    const identity = currentFirebaseUser();
    return attempt.current === active && (!identity || identity.uid === active.uid);
  }

  useEffect(() => {
    if (loading) return;
    const identity = currentFirebaseUser();
    if (identity) {
      try { rememberDeletionIdentity(identity.uid); } catch { /* Checked before sending DELETE. */ }
    }
    const active = attempt.current;
    if (active && (!identity || identity.uid === active.uid)) return;

    const uid = identity?.uid ?? lastDeletionIdentity();
    const record = uid ? readDeletionTracking(uid) : null;
    attempt.current = uid && record ? {
      uid, token: record.token, started: record.phase !== 'reauth',
    } : null;
    checks.current = 0;
    operation.current = false;
    setBusy(false);
    setChecked(false);
    setPhase(record ? record.phase === 'reauth' && !identity ? 'unknown' : record.phase : 'confirm');
    setError('');
    setLocalFailure(undefined);
    if (active) {
      setVisible(false);
      dialog.current?.close();
    }
  }, [loading, user]);

  useEffect(() => () => { attempt.current = null; }, []);

  function open(button: HTMLButtonElement) {
    const identity = currentFirebaseUser();
    if (!identity || user?.id !== identity.uid) return;
    trigger.current = button;
    if (attempt.current?.uid !== identity.uid) {
      attempt.current = { uid: identity.uid, started: false };
      checks.current = 0;
      setPhase('confirm');
      setError('');
    }
    setChecked(false);
    setVisible(true);
    if (!dialog.current?.open) dialog.current?.showModal();
    cancel.current?.focus();
  }

  function track(active: Attempt, phase: DeletionTracking['phase']) {
    if (active.token) saveDeletionTracking(active.uid, { token: active.token, phase });
  }

  function updateTracking(active: Attempt, phase: DeletionTracking['phase']) {
    try { track(active, phase); } catch { /* The original receipt was saved before sending. */ }
    setPhase(phase);
  }

  async function finishLocal(active: Attempt) {
    if (!active.completed || !current(active)) return;
    setLocalFailure(undefined);
    clearAuthProfileCache();
    if (currentFirebaseUser()?.uid === active.uid) {
      try {
        await logoutUser();
      } catch {
        if (current(active) && currentFirebaseUser()?.uid === active.uid) {
          setLocalFailure('logout');
          return;
        }
      }
    }
    if (!current(active)) return;
    if (currentFirebaseUser()) {
      setLocalFailure('logout');
      return;
    }
    setUser(null);
    try {
      await navigate('/login', { replace: true });
    } catch {
      if (current(active)) setLocalFailure('navigation');
    }
  }

  async function complete(active: Attempt) {
    if (!current(active)) return;
    active.completed = true;
    if (!visible) {
      setVisible(true);
      if (!dialog.current?.open) dialog.current?.showModal();
    }
    if (active.token) clearDeletionTracking(active.uid, active.token);
    active.token = undefined;
    setPhase('completed');
    setError('');
    await finishLocal(active);
  }

  async function retryLocal() {
    const active = attempt.current;
    if (!active?.completed || !current(active) || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await finishLocal(active);
    } finally {
      if (attempt.current === active) {
        operation.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    if (visible && phase === 'completed' && !busy && !localFailure &&
        pathname === '/login' && !currentFirebaseUser()) {
      dialog.current?.close();
    }
  }, [visible, phase, busy, localFailure, pathname]);

  async function start(provider?: 'password' | 'google.com') {
    const active = attempt.current;
    const identity = currentFirebaseUser();
    if (!active || !identity || identity.uid !== active.uid || !checked || operation.current || active.started) return;
    const password = passwordInput.current?.value;
    if (passwordInput.current) passwordInput.current.value = '';
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      if (provider) await reauthenticateForDeletion(identity, provider, password);
      if (!current(active) || currentFirebaseUser() !== identity) return;
      const stored = readDeletionTracking(active.uid);
      if (stored && stored.phase !== 'reauth') {
        active.token = stored.token;
        active.started = true;
        setPhase(stored.phase);
        return;
      }
      active.token = stored?.token ?? active.token ?? createDeletionToken();
      track(active, 'unknown');
      active.started = true;
      setPhase('sending');
      const receipt = await deleteUserAccount(active.token);
      if (!current(active)) return;
      if (receipt.status === 'completed') await complete(active);
      else updateTracking(active, 'pending');
    } catch (failure) {
      if (!current(active) || active.completed) return;
      const code = errorCode(failure);
      if (code === 'AUTH_RECENT_REQUIRED') {
        active.started = false;
        updateTracking(active, 'reauth');
        setError('Confirma tu identidad para continuar.');
      } else if (!active.started) {
        setError(provider ? (failure instanceof Error ? failure.message : 'No pudimos confirmar tu identidad.')
          : 'No pudimos guardar el comprobante. Verifica el almacenamiento del navegador.');
      } else if (code === 'VALIDATION_ERROR') {
        if (active.token) clearDeletionTracking(active.uid, active.token);
        active.token = undefined;
        active.started = false;
        setPhase('confirm');
        setChecked(false);
        setError('El servidor rechazó la solicitud. Verifica la operación o contacta a soporte.');
      } else if (code === 'ACCOUNT_DELETION_BLOCKED') {
        updateTracking(active, 'blocked');
      } else if (code === 'DELETION_STATUS_TOKEN_MISMATCH') {
        active.token = readDeletionTracking(active.uid)?.token ?? active.token;
        checks.current = MAX_AUTOMATIC_CHECKS;
        updateTracking(active, 'unknown');
        setError('La solicitud existente tiene otro comprobante. Si la iniciaste en otra pestaña, consulta allí o contacta a soporte.');
      } else {
        updateTracking(active, 'unknown');
        setError('No pudimos confirmar el resultado. Consulta el estado antes de tomar otra acción.');
      }
    } finally {
      if (attempt.current === active) {
        operation.current = false;
        setBusy(false);
      }
    }
  }

  async function checkStatus() {
    const active = attempt.current;
    if (!active?.token || active.completed || !current(active) || operation.current) return;
    checks.current++;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.getDeletionStatus(active.token, AbortSignal.timeout(10_000));
      if (!current(active)) return;
      if (result.status === 'completed') await complete(active);
      else if (result.status === 'blocked') updateTracking(active, 'blocked');
      else if (result.status === 'pending') updateTracking(active, 'pending');
      else {
        checks.current = MAX_AUTOMATIC_CHECKS;
        updateTracking(active, 'unknown');
        setError('El estado no se pudo verificar con este comprobante.');
      }
    } catch (failure) {
      if (!current(active) || active.completed) return;
      updateTracking(active, 'unknown');
      if (errorCode(failure) === 'DELETION_STATUS_NOT_FOUND') {
        checks.current = MAX_AUTOMATIC_CHECKS;
        setError('El estado no se pudo verificar con este comprobante.');
      } else {
        setError('No pudimos comprobar el estado. Puedes volver a consultarlo o contactar a soporte.');
      }
    } finally {
      if (attempt.current === active) {
        operation.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    if (busy || loading || (phase !== 'pending' && phase !== 'unknown')) return;
    const resume = () => {
      checks.current = 0;
      void checkStatus();
    };
    window.addEventListener('online', resume);
    const timer = checks.current < MAX_AUTOMATIC_CHECKS
      ? window.setTimeout(() => { void checkStatus(); }, CHECK_INTERVAL_MS) : undefined;
    return () => {
      window.removeEventListener('online', resume);
      window.clearTimeout(timer);
    };
  });

  const provider = currentFirebaseUser()?.providerData ?? [];
  const canCheck = phase === 'pending' || phase === 'unknown';
  const showConfirmation = phase === 'confirm' || phase === 'reauth';
  const active = attempt.current;
  const tracking = !loading && active?.token && user?.id === active.uid &&
    currentFirebaseUser()?.uid === active.uid && (canCheck || phase === 'blocked')
    ? { uid: active.uid, open: openTracking } : null;

  function openTracking(button: HTMLButtonElement) {
    if (!tracking || visible || currentFirebaseUser()?.uid !== tracking.uid) return;
    trigger.current = button;
    setVisible(true);
    dialog.current?.showModal();
    cancel.current?.focus();
  }

  const statusBase = "mt-4 rounded-[11px] border px-[17px] py-3 [&_strong]:font-['Inter_Variable',sans-serif] [&_strong]:text-[15px] [&_strong]:leading-5 [&_strong]:font-semibold [&_p]:mt-[5px] [&_p]:text-sm [&_p]:leading-5 [&_p]:text-muted";
  const statusInfo = `${statusBase} border-[#355d95] bg-surface-soft text-text`;
  const statusError = `${statusBase} border-[#99515e] bg-[#351d29] text-error`;
  const statusSuccess = `${statusBase} border-[#286a56] bg-[#103c30] text-success`;
  const actionBtn = `${deleteBtnBase} min-w-0 flex-[205_1_0] min-h-[44px] max-md:min-h-[46px] rounded-[9px] p-2 text-center`;
  const actionSecondary = `${actionBtn} border-input-border bg-surface text-link-strong hover:not-disabled:bg-subtle disabled:opacity-60!`;
  const actionDanger = `${actionBtn} flex-grow-[215] border-[#f08a8a] bg-danger-action-hover text-text enabled:hover:bg-danger-action disabled:opacity-[0.46]!`;
  const actionPrimary = `${actionBtn} flex-grow-[215] border-link bg-primary text-text hover:not-disabled:bg-primary-hover disabled:opacity-60!`;
  const reauthSecondary = `${deleteBtnBase} mt-3 min-h-[48px] rounded-[10px] border-border-strong bg-surface px-5 py-3 text-link-strong hover:not-disabled:bg-subtle disabled:opacity-60!`;
  const confirmStatusSpacing = phase === 'confirm' && error;
  const sendingStatusSpacing = phase === 'sending'
    ? 'mt-auto mb-[86px] min-h-[78px] max-md:min-h-[95px] max-md:mb-[95px] [@media(max-height:550px)]:my-[24px_0]'
    : '';

  return <OpenDeletion.Provider value={open}>
    <DeletionCompleted.Provider value={phase === 'completed' && !visible && !user}>
      <OpenTracking.Provider value={tracking}>{children}</OpenTracking.Provider>
    </DeletionCompleted.Provider>
    <dialog ref={dialog} className={`fixed inset-0 m-auto w-[min(500px,calc(100%-40px))] max-w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] overflow-auto [overflow-wrap:anywhere] rounded-[20px] max-md:rounded-[19px] border border-[#7d424c] max-md:border-[#854857] bg-surface px-[31px] pt-[37px] pb-[44px] max-md:px-[21px] max-md:pt-7 max-md:pb-10 [@media(max-height:550px)]:py-6 text-text shadow-[0_24px_64px_var(--dialog-shadow)] backdrop:bg-[rgb(7_16_29_/_72%)] max-md:backdrop:bg-[rgb(7_16_29_/_74%)] [&>h2]:text-[26px] [&>h2]:leading-8 max-md:[&>h2]:text-[23px] max-md:[&>h2]:leading-7 [&>p]:mt-4 [&>p]:text-muted [&>a]:mt-3 [&>a]:inline-block [&>a]:text-link [&>a]:underline ${(phase === 'confirm' || phase === 'sending') ? 'open:flex open:flex-col open:min-h-[min(430px,calc(100dvh-32px))] max-md:open:min-h-[min(433px,calc(100dvh-32px))] [@media(min-width:768px)_and_(min-height:550px)]:-top-[26px]' : ''}`} data-phase={phase}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-warning`}
      onCancel={event => { if (operation.current || attempt.current?.completed) event.preventDefault(); }}
      onClose={() => {
        setVisible(false);
        if (trigger.current?.isConnected) trigger.current.focus();
      }}>
      <h2 id={`${id}-title`}>Eliminar cuenta</h2>
      <p className="mt-[29px] text-base leading-[22px] max-md:mt-[27px] max-md:text-[15px] max-md:leading-[21px]" id={`${id}-warning`}>{phase === 'sending' ? 'Estamos procesando tu solicitud.' :
        'Si eliminas tu cuenta, perderás el acceso a TeamSpeak. Esta acción es definitiva.'}</p>
      {showConfirmation && <div className={phase === 'confirm' ? 'mt-auto pt-6' : 'mt-6'}>
        {confirmStatusSpacing && <div className={`${statusError} m-0 mb-3`} role="alert">
          <strong>Error al eliminar</strong><p>{error}</p>
        </div>}
        <label className="flex min-h-[58px] max-md:min-h-[56px] cursor-pointer items-center gap-3 rounded-[11px] border border-border bg-surface-soft px-[15px] py-3 max-md:px-[13px] font-['Inter_Variable',sans-serif] text-sm leading-5 font-medium text-text has-[input:checked]:border-[#4f8adc] has-[input:checked]:bg-[#182b3d]">
          <input className="m-0 grid h-5 w-5 flex-none appearance-none place-items-center rounded-[5px] border border-link bg-surface checked:bg-primary checked:after:h-[5px] checked:after:w-[9px] checked:after:-translate-y-px checked:after:-rotate-45 checked:after:border-b-2 checked:after:border-l-2 checked:after:border-text checked:after:content-[''] forced-colors:appearance-auto forced-colors:after:hidden" type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />
          <span>Entiendo las consecuencias de eliminar mi cuenta</span>
        </label>
      </div>}
      {phase === 'reauth' && <>
        <p>Confirma tu identidad con un método vinculado a tu cuenta.</p>
        {provider.some(entry => entry.providerId === 'password') && <form className="mt-6 mb-[22px]" onSubmit={event => { event.preventDefault(); void start('password'); }}>
          <label className="mb-4 block text-sm font-medium" htmlFor={`${id}-password`}>Contraseña actual</label>
          <input className="h-[52px] w-full rounded-[9px] border border-input-border bg-surface px-4 py-3 text-text" id={`${id}-password`} ref={passwordInput} type="password" autoComplete="current-password" required disabled={busy} />
          <button className={reauthSecondary} type="submit" disabled={busy || !checked}>Confirmar con contraseña</button>
        </form>}
        {provider.some(entry => entry.providerId === 'google.com') && <button className={reauthSecondary} type="button"
          disabled={busy || !checked} onClick={() => void start('google.com')}>Reautenticar con Google</button>}
      </>}
      {busy && phase !== 'completed' && <div className={`${statusInfo} ${sendingStatusSpacing}`} role="status">
        <strong>{phase === 'sending' ? 'Eliminando cuenta…' : canCheck ? 'Consultando estado…' : 'Comprobando identidad…'}</strong>
        {phase === 'sending' && <p>Esperando la respuesta del servidor.</p>}
      </div>}
      {phase === 'pending' && <div className={statusInfo} role="status">
        <strong>Eliminación pendiente</strong><p>La solicitud fue aceptada. La eliminación aún está pendiente.</p>
      </div>}
      {phase === 'unknown' && <div className={statusInfo} role="status">
        <strong>Resultado sin confirmar</strong><p>El resultado de la eliminación sigue sin confirmarse.</p>
      </div>}
      {phase === 'blocked' && <div className={statusError} role="alert">
        <strong>Eliminación bloqueada</strong><p>El proceso está bloqueado. Contacta a soporte.</p>
      </div>}
      {phase === 'completed' && <div className={statusSuccess} role="status">
        <strong>Cuenta eliminada</strong><p>El servidor confirmó la eliminación de tu cuenta.</p>
      </div>}
      {phase === 'completed' && busy && <p role="status">Finalizando la sesión local…</p>}
      {localFailure === 'logout' && <p role="alert">Tu cuenta fue eliminada, pero ocurrió un problema al cerrar la sesión en este dispositivo.</p>}
      {localFailure === 'navigation' && <p role="alert">La sesión está cerrada, pero no pudimos abrir el inicio de sesión.</p>}
      {phase !== 'confirm' && error && <p className={statusError} role="alert">{error}</p>}
      {(phase === 'unknown' || phase === 'blocked') && <Link to="/ayuda" onClick={() => dialog.current?.close()}>Ir a ayuda</Link>}
      <div className={`flex justify-end gap-4 max-md:gap-[14px] ${phase === 'sending' ? 'empty:hidden mt-6' : phase === 'confirm' && !error ? 'mt-[59px] max-md:mt-[94px] [@media(max-height:550px)]:mt-6' : 'mt-6'}`}>
        {phase !== 'completed' && phase !== 'sending' && <button ref={cancel} className={actionSecondary} type="button" disabled={busy}
          onClick={() => dialog.current?.close()}>{showConfirmation ? 'Cancelar' : 'Cerrar'}</button>}
        {phase === 'completed' && !busy && <button className={actionSecondary} type="button"
          onClick={() => void retryLocal()}>{localFailure === 'logout' ? 'Reintentar cierre de sesión' : 'Ir al inicio de sesión'}</button>}
        {phase === 'confirm' && <button className={actionDanger} type="button"
          disabled={!checked || busy} onClick={() => void start()}>Eliminar mi cuenta</button>}
        {canCheck && <button className={actionPrimary} type="button" disabled={busy}
          onClick={() => void checkStatus()}>Consultar estado</button>}
      </div>
    </dialog>
  </OpenDeletion.Provider>;
}
