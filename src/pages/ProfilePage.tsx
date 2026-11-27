import { avatarUrlError, isAvatarUrl, ProfileAvatar, ProfileAvatarEditor } from '../components/ProfileAvatar';
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
  if (draft.avatarUrl && (!isAvatarUrl(draft.avatarUrl))) {
    errors.avatarUrl = avatarUrlError;
  }
  return errors;
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
  const sessionIdentity = useRef(user);
  const [emailBusy, setEmailBusy] = useState(false);
  const [query, setQuery] = useState<Query>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
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
      const field = firstInvalid[0];
      document.getElementById(field === 'avatarUrl' ? 'profile-avatar-control' : `profile-${field}`)?.focus();
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
          setErrors(serverErrors);
        }
      }
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }

  const name = profile ? `${profile.nombre} ${profile.apellido}` : '';
  const showSessionIdentity = query.status === 'loading' || query.status === 'error';
  const identityUser = user?.name ? user : sessionIdentity.current;
  const identityName = profile ? name : showSessionIdentity && identityUser?.id === uid
    ? [identityUser.name, identityUser.apellido].filter(Boolean).join(' ') : '';
  const avatar = draft ? draft.avatarUrl : profile ? profile.avatarUrl : identityUser?.avatarUrl;
  const initials = profile ? `${profile.nombre[0] ?? ''}${profile.apellido[0] ?? ''}`
    : identityName.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  const btnBase = "inline-flex min-h-[44px] items-center justify-center gap-3 rounded-[9px] border px-5 py-[10px] font-['Inter_Variable',sans-serif] text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:opacity-60!";
  const primaryBtn = `${btnBase} border-link bg-primary text-text hover:not-disabled:bg-primary-hover`;
  const secondaryBtn = `${btnBase} border-border-strong bg-surface text-link-strong hover:not-disabled:bg-subtle`;
  const dangerBtn = `${btnBase} border-error bg-danger-action text-text hover:not-disabled:bg-danger-action-hover`;
  const noticeBase = 'my-[24px_16px] rounded-[9px] border border-border p-4 [&_a]:text-link [&_a]:underline';
  const inputClass = 'h-[52px] max-[900px]:h-[47px] w-full rounded-[9px] border border-input-border bg-surface px-4 py-3 text-text placeholder:text-muted placeholder:opacity-100 not-aria-[invalid=true]:border-border-strong aria-[invalid=true]:border-error read-only:text-muted';
  const identity = identityName && <div className={`user-profile-identity flex gap-5 [overflow-wrap:anywhere] [&_strong]:font-['Inter_Variable',sans-serif] [&_strong]:text-[19px] [&_strong]:font-semibold ${draft ? 'col-span-full my-[22px_14px] items-start' : 'mt-[22px] mb-6 items-center'}`}>
    <ProfileAvatar key={avatar} url={avatar} initials={initials} />
    <div className="min-w-0">
      <strong>{identityName}</strong>
      {draft && <ProfileAvatarEditor value={draft.avatarUrl} initials={initials} error={errors.avatarUrl} disabled={saving || saved}
        onApply={avatarUrl => {
          setDraft({ ...draft, avatarUrl });
          setErrors({ ...errors, avatarUrl: undefined });
        }} />}
    </div>
  </div>;
  return <section className="mx-auto max-w-[1072px]">
    <div className="mb-8 flex min-h-[78px] items-start justify-between gap-4 max-[900px]:mb-[30px] max-[900px]:min-h-0 max-[900px]:flex-wrap [&_h1]:text-[32px] [&_h1]:font-semibold max-[900px]:[&_h1]:text-[28px] [&_p]:mt-2 [&_p]:text-muted">
      <div><PageTitle title="Mi perfil" /><p>{editing ? 'Actualiza tu información personal.' : 'Consulta y administra los datos de tu cuenta.'}</p></div>
      {!user?.username && <Link className={`${secondaryBtn} shrink-0`} to="/dashboard">Mis salas</Link>}
    </div>
    <div className="relative grid grid-cols-[minmax(0,682fr)_minmax(0,364fr)] items-start gap-[26px] max-[900px]:grid-cols-1 max-[900px]:gap-4">
      <section className={`rounded-[18px] border border-border bg-surface px-[29px] py-[26px] max-[900px]:p-[21px] [&>h2]:text-[21px] ${editing ? 'flex min-h-[648px] flex-col max-md:min-h-[560px]' : 'min-h-[445px] max-[900px]:min-h-0'}${(query.status === 'loading' || query.status === 'error') ? ' max-md:min-h-[472px]' : ''}`} aria-labelledby="profile-heading">
        <h2 id="profile-heading" ref={heading} tabIndex={-1}>{editing && !saved ? 'Editar información personal' : 'Información personal'}</h2>
        {!draft && identity}
        {query.status === 'loading' && <div className="my-7 text-muted" role="status">
          <p className="sr-only">Cargando perfil…</p>
          <div className="mt-3 grid gap-6 max-[900px]:gap-5 [&>span]:block [&>span]:h-12 max-[900px]:[&>span]:h-14 [&>span]:rounded-[10px] [&>span]:bg-control-surface" aria-hidden="true"><span /><span /><span /></div>
        </div>}
        {query.status === 'error' && <>
          <div className={`${noticeBase} my-[32px_26px] border-error-strong bg-danger-surface text-error [&>p]:mt-2 [&>p]:text-muted`} role="alert">
            <strong>No pudimos cargar tu perfil</strong>
            <p>{query.message}</p>
          </div>
          <button className={`${primaryBtn} min-w-[min(168px,100%)] max-[900px]:w-full`} type="button" onClick={() => {
            setQuery({ status: 'loading' });
            setAttempt(value => value + 1);
            focusHeading();
          }}>Reintentar</button>
        </>}
        {query.status === 'incomplete' && <div className={noticeBase}>
          <p>Completa tu perfil para ver y editar tus datos.</p>
          <Link to="/completar-username" onClick={() => { if (user?.username) setUser({ ...user, username: undefined }); }}>Completar perfil</Link>
        </div>}
        {profile && <>
          {draft ? <form id="profile-edit-form" onSubmit={save} noValidate>
            <fieldset disabled={saving || saved} aria-busy={saving} className="grid min-w-0 grid-cols-2 gap-x-4 border-0 p-0 [&>*:nth-child(n+4)]:col-span-full">
              {identity}
              {fields.slice(0, 3).map(([field, label]) => <div className="mb-3" key={field}>
                <label className="mb-[7px] block text-sm font-medium" htmlFor={`profile-${field}`}>{label}</label>
                <input className={inputClass} id={`profile-${field}`} value={draft[field]} required
                  autoComplete={field === 'nombre' ? 'given-name' : field === 'apellido' ? 'family-name' : 'username'}
                  aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `profile-${field}-error` : undefined}
                  onChange={event => { setDraft({ ...draft, [field]: event.target.value }); setErrors({ ...errors, [field]: undefined }); }} />
                {errors[field] && <p id={`profile-${field}-error`} className="mt-1 text-sm text-error" role="alert">{errors[field]}</p>}
              </div>)}
              <div className="mb-3">
                <label className="mb-[7px] block text-sm font-medium" htmlFor="profile-email">Correo electrónico</label>
                <input className={inputClass} id="profile-email" value={profile.email} readOnly />
              </div>
            </fieldset>
            {saving && <div className={`${noticeBase} mt-[18px] mb-0 min-h-[78px] rounded-[11px] border-primary bg-surface-soft`} role="status"><strong>Guardando cambios…</strong><p>Actualizando tu perfil.</p></div>}
            {saved && <div className={`${noticeBase} mt-[18px] mb-0 min-h-[78px] rounded-[11px] border-[#286a56] bg-[#103c30] text-success`} role="status"><strong>Cambios guardados.</strong><p>Tu información se actualizó correctamente.</p></div>}
            {feedback && <div className={`${noticeBase} mt-[18px] mb-0 min-h-[78px] rounded-[11px] border-error-strong bg-danger-surface text-error`} role="alert"><strong>Error al guardar</strong><p>{feedback}</p></div>}
          </form> : <dl className="mb-[38px] max-[900px]:mb-0 [overflow-wrap:anywhere] [&>div]:py-[10px] [&>div+div]:border-t [&>div+div]:border-border max-[900px]:[&>div+div]:border-t-0 [&_dt]:text-sm [&_dt]:text-muted [&_dd]:mt-[3px] [&_dd]:text-lg">
            <div><dt>Nombre completo</dt><dd>{name}</dd></div>
            <div><dt>Nombre de usuario</dt><dd>{profile.username}</dd></div>
            <div><dt>Correo electrónico</dt><dd>{profile.email}</dd></div>
          </dl>}
          {draft && <div className="mt-auto flex flex-wrap gap-4 pt-[30px] max-md:pt-[22px] max-[900px]:grid max-[900px]:grid-cols-2 max-[900px]:gap-3">
            {saved ? <button className={`${primaryBtn} min-w-[min(100%,206px)] max-[900px]:col-span-full max-[900px]:min-w-0 max-[900px]:min-h-[46px] max-[900px]:px-2`} type="button" onClick={endEditing}>Volver al perfil</button> : <>
              <button className={`${secondaryBtn} min-w-[min(100%,178px)] max-[900px]:min-w-0 max-[900px]:min-h-[46px] max-[900px]:px-2`} ref={cancelButton} type="button" disabled={saving} onClick={cancel}>Cancelar</button>
              <button className={`${primaryBtn} min-w-[min(100%,206px)] max-[900px]:min-w-0 max-[900px]:min-h-[46px] max-[900px]:px-2`} type="submit" form="profile-edit-form" disabled={saving || emailBusy}>{saving ? 'Guardando…' : feedback ? 'Reintentar' : 'Guardar cambios'}</button>
            </>}
          </div>}
          {!draft && <button type="button" className={`${primaryBtn} absolute top-[130px] right-6 w-[calc((100%-26px)*364/1046-48px)] max-[900px]:static max-[900px]:mt-[26px] max-[900px]:w-full`} onClick={() => {
            setDraft(toDraft(profile));
            focusHeading();
          }}>Editar perfil</button>}
        </>}
        <AccountDeletionTrackingButton uid={uid} />
      </section>
      <div className={editing ? 'max-[900px]:[&:not(:has(.user-profile-notice))]:hidden' : ''}>
        <div className={`min-h-[265px] rounded-[18px] border border-border bg-surface px-6 py-[22px] max-[900px]:hidden [&>h2]:text-[19px] [&_p]:mt-2 [&_p]:text-muted ${profile && !draft ? 'pb-24' : ''}`}>
          <h2>Configuración de cuenta</h2>
          <p>Administra tu perfil y controla las acciones importantes.</p>
          {editing && <p className="!mt-[26px] !text-success font-semibold">Tus datos son privados</p>}
        </div>
        {profile && <div>
          <ProfileEmailChange uid={uid} email={profile.email} supported={user?.canChangeEmail} hidden={!editing || saving || saved}
            onBusy={setEmailBusy} onConfirmed={result => {
              if (!result.isCurrent()) return;
              setQuery({ status: 'ready', profile: result.profile });
              setUser(result.user);
            }} />
        </div>}
        {profile && !editing && <AccountDeletionDialog />}
      </div>
    </div>
    <dialog className="hidden open:flex open:flex-col fixed inset-0 m-auto w-[min(500px,100%)] max-[900px]:w-[calc(100%-40px)] max-w-[calc(100%-32px)] min-h-[min(355px,calc(100dvh-32px))] max-[900px]:min-h-[min(300px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] overflow-auto rounded-[18px] border border-border bg-surface p-7 text-text shadow-[0_24px_64px_var(--dialog-shadow)] backdrop:bg-overlay [&>h2]:text-2xl [&>p]:mt-3 [&>p]:text-[15px] [&>p]:text-muted" ref={discardDialog}
      aria-labelledby="profile-discard-title" aria-describedby="profile-discard-description" onClose={event => {
        if (event.currentTarget.returnValue === 'discard') return;
        if (blocker.state === 'blocked') blocker.reset();
        else cancelButton.current?.focus();
      }} onCancel={() => { if (discardDialog.current) discardDialog.current.returnValue = ''; }}>
      <h2 id="profile-discard-title">¿Descartar cambios?</h2>
      <p id="profile-discard-description">Se perderán las modificaciones que aún no has guardado.</p>
      <div className="mt-auto flex justify-center gap-3 pt-6">
        <button className={`${secondaryBtn} flex-1 max-w-[190px] max-[900px]:px-2`} type="button" onClick={() => discardDialog.current?.close('keep')}>Seguir editando</button>
        <button className={`${dangerBtn} flex-1 max-w-[190px] max-[900px]:px-2`} type="button" onClick={endEditing}>Descartar</button>
      </div>
    </dialog>
  </section>;
}
