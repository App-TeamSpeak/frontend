import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export function isAvatarUrl(value: string) {
  try { return value.length <= 2048 && new URL(value).protocol === 'https:'; } catch { return false; }
}

export const avatarUrlError = 'Escribe una URL HTTPS válida de hasta 2048 caracteres.';

export function ProfileAvatar({ url, initials, large = false }: { url?: string | null; initials: string; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState('');
  return <span className={`user-profile-avatar grid flex-none place-items-center overflow-hidden rounded-full bg-avatar-blue font-['Inter_Variable',sans-serif] font-semibold text-[#c9dbff] [&_img]:h-full [&_img]:w-full [&_img]:object-cover ${large ? 'h-[86px] w-[86px] text-[25px]' : 'h-[68px] w-[68px] text-[20px] max-[900px]:h-[62px] max-[900px]:w-[62px]'}`} aria-hidden="true">
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

  const dialogBtn = "inline-flex min-h-[46px] items-center justify-center gap-3 rounded-[10px] border p-2 font-['Inter_Variable',sans-serif] text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0";
  const dialogActions = 'grid max-w-[432px] grid-cols-[minmax(0,184fr)_minmax(0,218fr)] justify-start gap-[30px] max-md:grid-cols-[minmax(0,118fr)_minmax(0,172fr)] max-md:gap-2';

  return <>
    <button ref={trigger} id="profile-avatar-control" type="button" className="mt-[5px] flex min-h-8 items-center gap-2 border-0 bg-transparent p-0 font-['Inter_Variable',sans-serif] text-[13px] leading-[19px] font-medium text-link transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none hover:underline" disabled={disabled}
      aria-haspopup="dialog" aria-describedby={error ? 'profile-avatar-error' : undefined} onClick={open}>
      <img src="/assets/figma/avatar-camera.svg" alt="" width="15" height="15" /> Cambiar foto
    </button>
    {error && <p id="profile-avatar-error" className="mt-1 text-sm text-error" role="alert">{error}</p>}
    {createPortal(<dialog ref={dialog} className="fixed inset-0 m-auto open:flex open:flex-col w-[min(508px,calc(100%-40px))] max-w-[calc(100%-32px)] min-h-[min(438px,calc(100dvh-32px))] max-md:min-h-[min(440px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] overflow-auto rounded-[19px] border border-input-border bg-surface px-[23px] pt-6 pb-12 [@media(max-height:509px)]:pb-6 [@media(min-height:510px)]:-top-[26px] text-text shadow-[0_24px_64px_var(--dialog-shadow)] backdrop:bg-[rgb(5_11_22_/_75%)] [&_h2]:text-[25px] max-md:[&_h2]:text-[21px] [&>p]:mt-3 [&>p]:text-[15px] [&>p]:text-muted [&>p[tabindex='-1']:focus]:outline-none [&>p[tabindex='-1']:focus]:shadow-none"
      aria-labelledby="profile-avatar-title" onClose={() => trigger.current?.focus()}>
      <h2 id="profile-avatar-title">Cambiar foto de perfil</h2>
      <p ref={previewHeading} tabIndex={-1}>
        {preview ? 'Revisa la foto antes de aplicarla.' : 'Introduce el enlace HTTPS de la imagen.'}
      </p>
      <div className="mt-8 flex items-center gap-4 text-muted">
        {preview && url && imageState !== 'error'
          ? <span className="user-profile-avatar grid h-[86px] w-[86px] flex-none place-items-center overflow-hidden rounded-full bg-avatar-blue font-['Inter_Variable',sans-serif] text-[25px] font-semibold text-[#c9dbff] [&_img]:h-full [&_img]:w-full [&_img]:object-cover" aria-hidden="true">
              <img src={url} alt="" referrerPolicy="no-referrer" onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />
            </span>
          : <ProfileAvatar url={preview ? null : value} initials={initials} large />}
        <p>{preview
          ? url ? 'Nueva foto de perfil' : 'Se mostrarán las iniciales de tu perfil.'
          : 'Avatar actual'}</p>
      </div>
      {preview ? <>
        {url && imageState === 'loading' && <p role="status">Cargando vista previa…</p>}
        {url && imageState === 'error' && <p role="alert" className="mt-1 text-sm text-error">No pudimos cargar la vista previa. Revisa el enlace.</p>}
        <div className={`${dialogActions} mt-auto pt-6`}>
          <button type="button" className={`${dialogBtn} border-border-strong bg-surface text-link-strong hover:bg-subtle`} onClick={() => setPreview(false)}>Volver</button>
          <button type="button" className={`${dialogBtn} border-link bg-primary text-text hover:bg-primary-hover`} onClick={() => {
            onApply(url);
            dialog.current?.close();
          }}>{url ? 'Usar esta foto' : 'Usar iniciales'}</button>
        </div>
      </> : <form className="mt-auto pt-4" noValidate onSubmit={review}>
        <div className="m-0">
          <label className="mb-4 block text-sm font-medium" htmlFor="profile-avatarUrl">Avatar HTTPS (opcional)</label>
          <input className="h-[52px] w-full rounded-[9px] border border-input-border bg-surface px-4 py-3 text-text aria-[invalid=true]:border-error" ref={input} id="profile-avatarUrl" type="url" value={candidate}
            aria-invalid={Boolean(message)} aria-describedby={message ? 'profile-avatar-url-error' : 'profile-avatar-hint'}
            onChange={event => { setCandidate(event.target.value); setMessage(''); }} />
          <p id="profile-avatar-hint" className="mt-1.5 text-sm text-muted">Deja el campo vacío para usar tus iniciales.</p>
          {message && <p id="profile-avatar-url-error" className="mt-1 text-sm text-error" role="alert">{message}</p>}
        </div>
        <div className={`${dialogActions} mt-4`}>
          <button type="button" className={`${dialogBtn} border-border-strong bg-surface text-link-strong hover:bg-subtle`} onClick={() => dialog.current?.close()}>Cancelar</button>
          <button type="submit" className={`${dialogBtn} border-link bg-primary text-text hover:bg-primary-hover`}>Ver vista previa</button>
        </div>
      </form>}
    </dialog>, document.body)}
  </>;
}
