import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export function isAvatarUrl(value: string) {
  try { return value.length <= 2048 && new URL(value).protocol === 'https:'; } catch { return false; }
}

export const avatarUrlError = 'Escribe una URL HTTPS válida de hasta 2048 caracteres.';

export function ProfileAvatar({ url, initials }: { url?: string | null; initials: string }) {
  const [failedUrl, setFailedUrl] = useState('');
  return <span className="user-profile-avatar" aria-hidden="true">
    {url && url !== failedUrl
      ? <img key={url} src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : initials.toUpperCase()}
  </span>;
}

export function ProfileAvatarEditor({ value, error, initials, disabled, onApply }: {
  value: string;
  error?: string;
  initials: string;
  disabled: boolean;
  onApply: (value: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const previewHeading = useRef<HTMLParagraphElement>(null);
  const [candidate, setCandidate] = useState('');
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const url = candidate.trim();

  useEffect(() => {
    if (!dialog.current?.open) return;
    if (preview) previewHeading.current?.focus();
    else input.current?.focus();
  }, [preview]);

  function open() {
    setCandidate(value);
    setPreview(false);
    setMessage('');
    dialog.current?.showModal();
    input.current?.focus();
  }

  function review(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (url && !isAvatarUrl(url)) {
      setMessage(avatarUrlError);
      input.current?.focus();
      return;
    }
    setImageState('loading');
    setMessage('');
    setPreview(true);
  }

  return <>
    <button ref={trigger} id="profile-avatar-control" type="button" className="user-profile-avatar-trigger" disabled={disabled}
      aria-haspopup="dialog" aria-describedby={error ? 'profile-avatar-error' : undefined} onClick={open}>
      <img src="/assets/figma/avatar-camera.svg" alt="" width="15" height="15" /> Cambiar foto
    </button>
    {error && <p id="profile-avatar-error" className="field-error" role="alert">{error}</p>}
    {createPortal(<dialog ref={dialog} className="room-management-dialog user-profile-dialog user-profile-avatar-dialog"
      aria-labelledby="profile-avatar-title" onClose={() => trigger.current?.focus()}>
      <h2 id="profile-avatar-title">Cambiar foto de perfil</h2>
      <p ref={previewHeading} tabIndex={-1}>
        {preview ? 'Revisa la foto antes de aplicarla.' : 'Introduce el enlace HTTPS de la imagen.'}
      </p>
      <div className="user-profile-avatar-example">
        {preview && url && imageState !== 'error'
          ? <span className="user-profile-avatar" aria-hidden="true">
              <img src={url} alt="" referrerPolicy="no-referrer" onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />
            </span>
          : <ProfileAvatar url={preview ? null : value} initials={initials} />}
        <p>{preview
          ? url ? 'Nueva foto de perfil' : 'Se mostrarán las iniciales de tu perfil.'
          : 'Avatar actual'}</p>
      </div>
      {preview ? <>
        {url && imageState === 'loading' && <p role="status">Cargando vista previa…</p>}
        {url && imageState === 'error' && <p role="alert" className="field-error">No pudimos cargar la vista previa. Revisa el enlace.</p>}
        <div className="room-management-dialog-actions">
          <button type="button" className="button secondary" onClick={() => setPreview(false)}>Volver</button>
          <button type="button" className="button primary" onClick={() => {
            onApply(url);
            dialog.current?.close();
          }}>{url ? 'Usar esta foto' : 'Usar iniciales'}</button>
        </div>
      </> : <form noValidate onSubmit={review}>
        <div className="form-field">
          <label htmlFor="profile-avatarUrl">Avatar HTTPS (opcional)</label>
          <input ref={input} id="profile-avatarUrl" type="url" value={candidate}
            aria-invalid={Boolean(message)} aria-describedby={message ? 'profile-avatar-url-error' : 'profile-avatar-hint'}
            onChange={event => { setCandidate(event.target.value); setMessage(''); }} />
          <p id="profile-avatar-hint">Deja el campo vacío para usar tus iniciales.</p>
          {message && <p id="profile-avatar-url-error" className="field-error" role="alert">{message}</p>}
        </div>
        <div className="room-management-dialog-actions">
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Cancelar</button>
          <button type="submit" className="button primary">Ver vista previa</button>
        </div>
      </form>}
    </dialog>, document.body)}
  </>;
}
