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
const DeletionCompleted = createContext(false);
export function useAccountDeletionCompleted() { return useContext(DeletionCompleted); }

const MAX_AUTOMATIC_CHECKS = 3;
const CHECK_INTERVAL_MS = 3_000;

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

export function AccountDeletionDialog() {
  const open = useContext(OpenDeletion);
  return <button className="button room-management-dialog-danger" type="button"
    onClick={event => open?.(event.currentTarget)}>Eliminar cuenta</button>;
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
  return <OpenDeletion.Provider value={open}>
    <DeletionCompleted.Provider value={phase === 'completed' && !visible && !user}>
      {children}
    </DeletionCompleted.Provider>
    {!visible && (canCheck || phase === 'blocked') && attempt.current && current(attempt.current) &&
      <button className="button secondary" type="button" onClick={event => {
        trigger.current = event.currentTarget;
        setVisible(true);
        dialog.current?.showModal();
        cancel.current?.focus();
      }}>Ver seguimiento de eliminación</button>}
    <dialog ref={dialog} className="room-management-dialog user-profile-dialog profile-delete-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-warning`}
      onCancel={event => { if (operation.current || attempt.current?.completed) event.preventDefault(); }}
      onClose={() => {
        setVisible(false);
        if (trigger.current?.isConnected) trigger.current.focus();
      }}>
      <h2 id={`${id}-title`}>Eliminar cuenta</h2>
      <p id={`${id}-warning`}>Si eliminas tu cuenta, perderás el acceso a TeamSpeak. Esta acción es definitiva.</p>
      {showConfirmation && <label className="profile-delete-confirmation">
        <input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />
        <span>Entiendo las consecuencias de eliminar mi cuenta</span>
      </label>}
      {phase === 'reauth' && <>
        <p>Confirma tu identidad con un método vinculado a tu cuenta.</p>
        {provider.some(entry => entry.providerId === 'password') && <form onSubmit={event => { event.preventDefault(); void start('password'); }}>
          <label htmlFor={`${id}-password`}>Contraseña actual</label>
          <input id={`${id}-password`} ref={passwordInput} type="password" autoComplete="current-password" required disabled={busy} />
          <button className="button secondary" type="submit" disabled={busy || !checked}>Confirmar con contraseña</button>
        </form>}
        {provider.some(entry => entry.providerId === 'google.com') && <button className="button secondary" type="button"
          disabled={busy || !checked} onClick={() => void start('google.com')}>Reautenticar con Google</button>}
      </>}
      {busy && phase !== 'completed' && <p role="status">{phase === 'sending' ? 'Eliminando cuenta…' : canCheck ? 'Consultando estado…' : 'Comprobando identidad…'}</p>}
      {phase === 'pending' && <p role="status">La solicitud fue aceptada. La eliminación aún está pendiente.</p>}
      {phase === 'unknown' && <p role="status">El resultado de la eliminación sigue sin confirmarse.</p>}
      {phase === 'blocked' && <p role="alert">El proceso está bloqueado. Contacta a soporte.</p>}
      {phase === 'completed' && <p role="status">El servidor confirmó la eliminación de tu cuenta.</p>}
      {phase === 'completed' && busy && <p role="status">Finalizando la sesión local…</p>}
      {localFailure === 'logout' && <p role="alert">Tu cuenta fue eliminada, pero ocurrió un problema al cerrar la sesión en este dispositivo.</p>}
      {localFailure === 'navigation' && <p role="alert">La sesión está cerrada, pero no pudimos abrir el inicio de sesión.</p>}
      {error && <p role="alert">{error}</p>}
      {(phase === 'unknown' || phase === 'blocked') && <Link to="/ayuda" onClick={() => dialog.current?.close()}>Ir a ayuda</Link>}
      <div className="room-management-dialog-actions">
        {phase !== 'completed' && <button ref={cancel} className="button secondary" type="button" disabled={busy}
          onClick={() => dialog.current?.close()}>{showConfirmation ? 'Cancelar' : 'Cerrar'}</button>}
        {phase === 'completed' && !busy && <button className="button secondary" type="button"
          onClick={() => void retryLocal()}>{localFailure === 'logout' ? 'Reintentar cierre de sesión' : 'Ir al inicio de sesión'}</button>}
        {phase === 'confirm' && <button className="button room-management-dialog-danger" type="button"
          disabled={!checked || busy} onClick={() => void start()}>Eliminar mi cuenta</button>}
        {canCheck && <button className="button secondary" type="button" disabled={busy}
          onClick={() => void checkStatus()}>Consultar estado</button>}
      </div>
    </dialog>
  </OpenDeletion.Provider>;
}
