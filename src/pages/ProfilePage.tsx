import { ProfileEmailChange } from '../components/ProfileEmailChange';
import { AccountDeletionDialog, AccountDeletionTrackingButton } from '../components/AccountDeletionDialog';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PageTitle } from '../components/PageTitle';
import { ApiError, type UserProfile } from '../services/api';
import { AuthError, refreshProfile, updateUserProfile } from '../services/auth';

const fields = [
  ['nombre', 'Nombre'],
  ['apellido', 'Apellido'],
  ['username', 'Nombre de usuario'],
  ['avatarUrl', 'Avatar HTTPS (opcional)'],
] as const;

type Field = typeof fields[number][0];
type Draft = Record<Field, string>;
type FieldErrors = Partial<Record<Field, string>>;
type Query = { status: 'loading' | 'incomplete' } | { status: 'error'; message: string } |
  { status: 'ready'; profile: UserProfile };

function toDraft(profile: UserProfile): Draft {
  return { nombre: profile.nombre, apellido: profile.apellido, username: profile.username, avatarUrl: profile.avatarUrl ?? '' };
}

function validate(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of ['nombre', 'apellido'] as const) {
    if (!draft[field] || draft[field].length > 100) {
      errors[field] = 'Escribe entre 1 y 100 caracteres.';
    }
  }
  if (!/^[A-Za-z0-9_-]{8,30}$/.test(draft.username)) {
    errors.username = 'Usa de 8 a 30 letras ASCII, números, guiones o guiones bajos.';
  }
  if (draft.avatarUrl && (draft.avatarUrl.length > 2048 || !isHttps(draft.avatarUrl))) {
    errors.avatarUrl = 'Escribe una URL HTTPS válida de hasta 2048 caracteres.';
  }
  return errors;
}

function isHttps(value: string) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function errorMessage(error: unknown, action: 'cargar' | 'guardar') {
  const code = error instanceof ApiError || error instanceof AuthError ? error.code : '';
  switch (code) {
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID': return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 'EMAIL_NOT_VERIFIED': return 'Verifica tu correo para continuar.';
    case 'PROFILE_INCOMPLETE':
      return action === 'guardar' ? 'Completa tu perfil antes de editarlo.' : 'No pudimos confirmar el estado de tu perfil. Reintenta.';
    case 'PROFILE_NOT_FOUND':
      return action === 'guardar' ? 'Tu perfil ya no está disponible. Vuelve a consultarlo.' : 'No encontramos tu perfil. Reintenta o contacta con soporte.';
    case 'PROFILE_INCONSISTENT': return 'Tu perfil requiere revisión. Contacta con soporte.';
    case 'AUTH_UNAVAILABLE':
    case 'FIRESTORE_UNAVAILABLE': return 'El servicio no está disponible. Inténtalo de nuevo.';
    case 'VALIDATION_ERROR': return 'Revisa los datos antes de guardar.';
    case 'ACCOUNT_DELETION_PENDING':
    case 'ACCOUNT_DELETION_BLOCKED':
    case 'ACCOUNT_DELETED': return 'Tu cuenta no tiene acceso al perfil. Contacta con soporte.';
    default: return `No pudimos ${action === 'cargar' ? 'cargar tu perfil' : 'guardar los cambios'}. Inténtalo de nuevo.`;
  }
}

export function ProfilePage() {
  const { user } = useAuth();
  return user ? <ProfileContent key={user.id} uid={user.id} /> : null;
}

function ProfileContent({ uid }: { uid: string }) {
  const { user, setUser } = useAuth();
  const [emailBusy, setEmailBusy] = useState(false);
  const [query, setQuery] = useState<Query>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const avatarOptions = useRef<HTMLDetailsElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshProfile(uid).then(result => {
      if (controller.signal.aborted || !result.isCurrent()) return;
      const { response, user: confirmedUser } = result;
      if (!response) {
        setUser(confirmedUser);
        setQuery({ status: 'error', message: errorMessage(result.error, 'cargar') });
        return;
      }
      if (response.uid !== uid || (response.profile && response.profile.uid !== uid)) {
        setQuery({ status: 'error', message: 'No pudimos verificar que el perfil corresponda a tu sesión.' });
        return;
      }
      setUser(confirmedUser);
      if (response.profileStatus === 'incomplete') {
        setQuery({ status: 'incomplete' });
      } else if (response.profile) {
        setQuery({ status: 'ready', profile: response.profile });
      } else {
        setQuery({ status: 'error', message: 'El servicio devolvió un perfil incompleto. Inténtalo de nuevo.' });
      }
    }).catch(error => {
      if (!controller.signal.aborted) setQuery({ status: 'error', message: errorMessage(error, 'cargar') });
    });
    return () => controller.abort();
  }, [attempt, uid, setUser]);

  const profile = query.status === 'ready' ? query.profile : null;
  const editing = draft !== null;
  const changed = Boolean(profile && draft && fields.some(([field]) =>
    toDraft(profile)[field] !== draft[field].trim(),
  ));
  const blocker = useBlocker(changed);

  useEffect(() => {
    if (!changed) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [changed]);

  useEffect(() => {
    if (blocker.state !== 'blocked' || saving || pending.current) return;
    if (saved) {
      blocker.proceed();
      return;
    }
    const dialog = discardDialog.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [blocker, saved, saving]);
  const focusHeading = () => heading.current?.focus();

  function endEditing() {
    setDraft(null);
    setErrors({});
    setFeedback('');
    setSaved(false);
    discardDialog.current?.close('discard');
    if (blocker.state === 'blocked') blocker.proceed();
    else focusHeading();
  }

  function cancel() {
    if (pending.current) return;
    if (changed) {
      discardDialog.current?.showModal();
      discardDialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    else endEditing();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !profile || pending.current || saved || emailBusy) return;
    const values: Draft = {
      nombre: draft.nombre.trim(), apellido: draft.apellido.trim(),
      username: draft.username.trim(), avatarUrl: draft.avatarUrl.trim(),
    };
    const invalid = validate(values);
    setErrors(invalid);
    setFeedback('');
    const firstInvalid = fields.find(([field]) => invalid[field]);
    if (firstInvalid) {
      if (firstInvalid[0] === 'avatarUrl' && avatarOptions.current) {
        avatarOptions.current.open = true;
      }
      document.getElementById(`profile-${firstInvalid[0]}`)?.focus();
      return;
    }
    const patch: Parameters<typeof updateUserProfile>[0] = {};
    if (values.nombre !== profile.nombre) patch.nombre = values.nombre;
    if (values.apellido !== profile.apellido) patch.apellido = values.apellido;
    if (values.username !== profile.username) patch.username = values.username;
    if ((values.avatarUrl || null) !== profile.avatarUrl) patch.avatarUrl = values.avatarUrl || null;
    if (Object.keys(patch).length === 0) { endEditing(); return; }

    pending.current = true;
    setSaving(true);
    try {
      const result = await updateUserProfile(patch);
      if (!active.current || !result.isCurrent()) return;
      if (!result.profile || result.profile.uid !== uid) {
        setFeedback('No pudimos confirmar los cambios. Vuelve a consultar tu perfil.');
        return;
      }
      setQuery({ status: 'ready', profile: result.profile });
      setDraft(toDraft(result.profile));
      setAvatarFailed(false);
      setUser(result.user);
      setSaved(true);
    } catch (error) {
      if (!active.current) return;
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setErrors({ username: 'Ese nombre de usuario ya está en uso.' });
      } else {
        setFeedback(errorMessage(error, 'guardar'));
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
          const serverErrors: FieldErrors = {};
          for (const issue of error.details) {
            const field = fields.find(([key]) => key === issue?.path?.[0])?.[0];
            if (field) serverErrors[field] = 'Revisa el valor de este campo.';
          }
          if (serverErrors.avatarUrl && avatarOptions.current) avatarOptions.current.open = true;
          setErrors(serverErrors);
        }
      }
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }

  const name = profile ? `${profile.nombre} ${profile.apellido}` : '';
  return <section className="user-profile">
    <div className="user-profile-heading">
      <div><PageTitle title="Mi perfil" /><p>{editing ? 'Actualiza tu información personal.' : 'Consulta y administra los datos de tu cuenta.'}</p></div>
      {!user?.username && <Link className="button secondary" to="/dashboard">Mis salas</Link>}
    </div>
    <div className="user-profile-grid">
      <section className="user-profile-card" aria-labelledby="profile-heading">
        <h2 id="profile-heading" ref={heading} tabIndex={-1}>{editing ? 'Editar información personal' : 'Información personal'}</h2>
        {query.status === 'loading' && <div className="user-profile-loading" role="status">
          <p>Cargando perfil…</p>
          <div aria-hidden="true"><span /><span /><span /></div>
        </div>}
        {query.status === 'error' && <>
          <p className="user-profile-notice user-profile-error" role="alert">{query.message}</p>
          <button className="button primary" type="button" onClick={() => {
            setQuery({ status: 'loading' });
            setAttempt(value => value + 1);
            focusHeading();
          }}>Reintentar</button>
        </>}
        {query.status === 'incomplete' && <div className="user-profile-notice">
          <p>Completa tu perfil para ver y editar tus datos.</p>
          <Link to="/completar-username" onClick={() => { if (user?.username) setUser({ ...user, username: undefined }); }}>Completar perfil</Link>
        </div>}
        {profile && <>
          <div className="user-profile-identity">
            <span className="user-profile-avatar" aria-hidden="true">
              {profile.avatarUrl && !avatarFailed ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> :
                `${profile.nombre[0] ?? ''}${profile.apellido[0] ?? ''}`.toUpperCase()}
            </span>
            <strong>{name}</strong>
          </div>
          {draft ? <form onSubmit={save} noValidate>
            <fieldset disabled={saving || saved} aria-busy={saving} className="user-profile-fields">
              {fields.slice(0, 3).map(([field, label]) => <div className="form-field" key={field}>
                <label htmlFor={`profile-${field}`}>{label}</label>
                <input id={`profile-${field}`} value={draft[field]} required
                  autoComplete={field === 'nombre' ? 'given-name' : field === 'apellido' ? 'family-name' : 'username'}
                  aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `profile-${field}-error` : undefined}
                  onChange={event => { setDraft({ ...draft, [field]: event.target.value }); setErrors({ ...errors, [field]: undefined }); }} />
                {errors[field] && <p id={`profile-${field}-error`} className="field-error" role="alert">{errors[field]}</p>}
              </div>)}
              <div className="form-field">
                <label htmlFor="profile-email">Correo electrónico</label>
                <input id="profile-email" value={profile.email} readOnly />
              </div>
              <details className="user-profile-avatar-option" ref={avatarOptions}>
                <summary>Opciones de avatar</summary>
                <div className="form-field">
                  <label htmlFor="profile-avatarUrl">Avatar HTTPS (opcional)</label>
                  <input id="profile-avatarUrl" type="url" value={draft.avatarUrl}
                    aria-invalid={Boolean(errors.avatarUrl)} aria-describedby={errors.avatarUrl ? 'profile-avatarUrl-error' : undefined}
                    onChange={event => { setDraft({ ...draft, avatarUrl: event.target.value }); setErrors({ ...errors, avatarUrl: undefined }); }} />
                  {errors.avatarUrl && <p id="profile-avatarUrl-error" className="field-error" role="alert">{errors.avatarUrl}</p>}
                </div>
              </details>
            </fieldset>
            {saving && <p className="user-profile-notice user-profile-saving" role="status">Guardando cambios…</p>}
            {saved && <p className="user-profile-notice user-profile-success" role="status">Cambios guardados.</p>}
            {feedback && <p className="user-profile-notice user-profile-error" role="alert">{feedback}</p>}
            <div className="user-profile-actions">
              {saved ? <button className="button primary" type="button" onClick={endEditing}>Volver al perfil</button> : <>
                <button className="button secondary" ref={cancelButton} type="button" disabled={saving} onClick={cancel}>Cancelar</button>
                <button className="button primary" type="submit" disabled={saving || emailBusy}>{saving ? 'Guardando…' : feedback ? 'Reintentar' : 'Guardar cambios'}</button>
              </>}
            </div>
          </form> : <dl className="user-profile-data">
            <div><dt>Nombre completo</dt><dd>{name}</dd></div>
            <div><dt>Nombre de usuario</dt><dd>{profile.username}</dd></div>
            <div><dt>Correo electrónico</dt><dd>{profile.email}</dd></div>
          </dl>}
          <ProfileEmailChange uid={uid} email={profile.email} supported={user?.canChangeEmail} hidden={!editing || saving || saved}
            onBusy={setEmailBusy} onConfirmed={result => {
              if (!result.isCurrent()) return;
              setQuery({ status: 'ready', profile: result.profile });
              setUser(result.user);
            }} />
          {!draft && <button type="button" className="button primary user-profile-edit" onClick={() => {
            setDraft(toDraft(profile));
            focusHeading();
          }}>Editar perfil</button>}
        </>}
        <AccountDeletionTrackingButton uid={uid} />
      </section>
      <div className={`user-profile-account${editing ? ' user-profile-account-editing' : ''}`}>
        <div className={`user-profile-card user-profile-settings${profile && !draft ? ' user-profile-settings-view' : ''}`}>
          <h2>Configuración de cuenta</h2>
          <p>Administra tu perfil y controla las acciones importantes.</p>
          {editing && <p className="user-profile-private">Tus datos son privados</p>}
        </div>
        {profile && !editing && <AccountDeletionDialog />}
      </div>
    </div>
    <dialog className="room-management-dialog user-profile-dialog user-profile-discard" ref={discardDialog}
      aria-labelledby="profile-discard-title" aria-describedby="profile-discard-description" onClose={event => {
        if (event.currentTarget.returnValue === 'discard') return;
        if (blocker.state === 'blocked') blocker.reset();
        else cancelButton.current?.focus();
      }} onCancel={() => { if (discardDialog.current) discardDialog.current.returnValue = ''; }}>
      <h2 id="profile-discard-title">¿Descartar cambios?</h2>
      <p id="profile-discard-description">Se perderán las modificaciones que aún no has guardado.</p>
      <div className="room-management-dialog-actions">
        <button className="button secondary" type="button" onClick={() => discardDialog.current?.close('keep')}>Seguir editando</button>
        <button className="button room-management-dialog-danger" type="button" onClick={endEditing}>Descartar</button>
      </div>
    </dialog>
  </section>;
}
