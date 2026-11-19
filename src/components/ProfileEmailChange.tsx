import { useEffect, useRef, useState, type FormEvent } from 'react';
import { confirmVerifiedEmailChange, requestVerifiedEmailChange } from '../services/auth';

type Confirmation = NonNullable<Awaited<ReturnType<typeof confirmVerifiedEmailChange>>>;
type Phase = 'closed' | 'idle' | 'reauth' | 'validating' | 'sending' | 'pending' | 'checking' | 'confirmed';

export function ProfileEmailChange({ uid, email, supported, hidden, onBusy, onConfirmed }: {
  uid: string;
  email: string;
  supported?: boolean;
  hidden: boolean;
  onBusy: (busy: boolean) => void;
  onConfirmed: (result: Confirmation) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [pendingTarget, setPendingTarget] = useState('');
  const [resent, setResent] = useState(false);
  const [previousLink, setPreviousLink] = useState(false);
  const [notVerified, setNotVerified] = useState(false);
  const operation = useRef<AbortController>(null);
  useEffect(() => () => { operation.current?.abort(); }, []);
  const busy = phase === 'validating' || phase === 'sending' || phase === 'checking';

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation.current || supported === false) return;
    const form = event.currentTarget;
    const address = pendingTarget || target.trim().toLowerCase();
    if (!address) {
      setError('Introduce un correo electrónico válido.');
      return;
    }
    if (address === email.trim().toLowerCase()) {
      setError('El nuevo correo debe ser diferente al actual.');
      return;
    }
    const passwordField = form.elements.namedItem('email-password') as HTMLInputElement | null;
    const password = passwordField?.value;
    if (passwordField) passwordField.value = '';
    const controller = new AbortController();
    operation.current = controller;
    onBusy(true);
    setError('');
    setResent(false);
    setNotVerified(false);
    setTarget(address);
    setPhase('validating');
    try {
      await requestVerifiedEmailChange(uid, address, controller.signal, password, () => setPhase('sending'));
      if (!controller.signal.aborted) {
        setPendingTarget(address);
        setResent(Boolean(pendingTarget));
        setPhase('pending');
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      const code = typeof failure === 'object' && failure && 'code' in failure ? failure.code : '';
      const recent = code === 'AUTH_RECENT_REQUIRED' || code === 'auth/requires-recent-login' || password !== undefined;
      setPhase(recent ? 'reauth' : pendingTarget ? 'pending' : 'idle');
      setError(code === 'AUTH_RECENT_REQUIRED' ? 'Confirma tu contraseña para continuar.'
        : failure instanceof Error ? failure.message : 'No pudimos enviar la verificación.');
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        if (!controller.signal.aborted) onBusy(false);
      }
    }
  }

  async function check() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    onBusy(true);
    setError('');
    setNotVerified(false);
    setPhase('checking');
    try {
      const result = await confirmVerifiedEmailChange(uid, pendingTarget);
      if (controller.signal.aborted) return;
      if (!result || !result.isCurrent()) {
        setNotVerified(true);
        setPhase('pending');
        return;
      }
      onConfirmed(result);
      setPendingTarget('');
      setPreviousLink(false);
      setPhase('confirmed');
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'No pudimos comprobar el cambio.');
      setPhase('pending');
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        if (!controller.signal.aborted) onBusy(false);
      }
    }
  }

  function reset(nextPhase: 'idle' | 'closed', nextTarget = '') {
    if (operation.current) return;
    if (pendingTarget) setPreviousLink(true);
    setPendingTarget('');
    setTarget(nextTarget);
    setError('');
    setNotVerified(false);
    setResent(false);
    setPhase(nextPhase);
  }

  if (hidden) return null;
  if (supported === false) return <p className="user-profile-notice">Tu método de autenticación no admite cambiar el correo en TeamSpeak.</p>;
  if (supported !== true) return null;

  const pending = Boolean(pendingTarget);
  const editable = !pending && phase !== 'closed' && phase !== 'confirmed';
  return <section className="user-profile-notice" aria-labelledby="profile-email-change-title">
    <h3 id="profile-email-change-title">Cambiar correo electrónico</h3>
    {previousLink && <p role="status">Los enlaces enviados anteriormente pueden seguir vigentes.</p>}
    {phase === 'closed' && <button type="button" className="button secondary"
      onClick={() => reset('idle')}>Abrir cambio de correo</button>}
    {phase === 'confirmed' && <>
      <p role="status">El correo nuevo fue verificado y sincronizado con tu perfil.</p>
      <button type="button" className="button secondary" onClick={() => reset('idle')}>Cambiar otra dirección</button>
    </>}
    {pending && <>
      <p>Verificación pendiente para <strong>{pendingTarget}</strong>. Confirma el cambio desde tu nuevo correo.</p>
      {resent && <p role="status">Se solicitó otra verificación para este correo.</p>}
      {notVerified && <p role="status">El cambio todavía está pendiente de verificación.</p>}
    </>}
    {(editable || pending) && <form onSubmit={send}>
      {editable && <div className="form-field">
        <label htmlFor="new-profile-email">Nuevo correo electrónico</label>
        <input id="new-profile-email" type="email" value={target} autoComplete="email" required disabled={busy}
          onInvalid={() => setError('Introduce un correo electrónico válido.')}
          onChange={event => { setTarget(event.target.value); setError(''); }} />
      </div>}
      {phase === 'reauth' && <div className="form-field">
        <label htmlFor="profile-email-password">Contraseña actual</label>
        <input id="profile-email-password" name="email-password" type="password" autoComplete="current-password" required />
      </div>}
      {busy && <p role="status">{phase === 'checking' ? 'Comprobando verificación…'
        : phase === 'validating' ? 'Validando disponibilidad…'
        : pending ? 'Enviando otra verificación…' : 'Enviando verificación…'}</p>}
      <div className="user-profile-actions">
        {pending && <button type="button" className="button secondary" disabled={busy} onClick={() => void check()}>Comprobar verificación</button>}
        <button type="submit" className="button secondary" disabled={busy}>{pending ? 'Enviar otra verificación' : 'Enviar verificación'}</button>
        {pending ? <>
          <button type="button" className="button secondary" disabled={busy} onClick={() => reset('idle', pendingTarget)}>Cambiar dirección</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => reset('closed')}>Salir del cambio de correo</button>
        </> : <button type="button" className="button secondary" disabled={busy}
          onClick={() => reset(previousLink ? 'closed' : 'idle')}>Cancelar cambio de correo</button>}
      </div>
    </form>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
