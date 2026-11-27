import { useAccountDeletionCompleted } from '../components/AccountDeletionDialog';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { useOptionalAuth } from '../auth/AuthContext';
import { AuthError, continueWithGoogle, loginUser, registerUser } from '../services/auth';
type AuthStatus = 'idle' | 'loading' | 'error' | 'success';
export function isValidEmail(value: string) {
  const email = value.trim();
  const atIndex = email.indexOf('@');
  const domain = atIndex >= 0 ? email.slice(atIndex + 1) : '';
  let hasWhitespace = false;

  for (const character of email) {
    if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
      hasWhitespace = true;
      break;
    }
  }

  return atIndex > 0 && email.indexOf('@', atIndex + 1) === -1 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !hasWhitespace;
}
export function StudyIllustration() { return <div className="mt-7 h-[420px] rounded-[28px] bg-surface-soft px-[50px] py-[58px]" aria-hidden="true"><div className="h-[280px] rounded-[22px] border border-link bg-surface p-[26px]"><div className="grid grid-cols-2 gap-[18px]"><div className="h-[112px] rounded-[14px] bg-avatar-blue" /><div className="h-[112px] rounded-[14px] bg-avatar-green" /></div><div className="mt-[22px] min-h-[92px] rounded-[12px] border border-border bg-surface-soft px-6 py-[14px]"><strong className="font-['Inter_Variable',sans-serif] text-base font-semibold">Una sala para cada proyecto</strong><p className="mt-2 text-[13px]">Ideas, voz y pantalla compartida.</p></div></div><span className="inline-flex -translate-y-1.5 items-center rounded-[14px] bg-avatar-green px-3 py-1.5 text-xs text-success">EN TIEMPO REAL</span></div>; }
export const authFieldsClass = 'grid gap-[14px]';
export const authFieldClass = 'min-w-0 m-0';
export const authLabelClass = 'mb-[5px] block text-sm font-medium';
export const authInputClass = 'h-[50px] w-full rounded-[9px] border border-input-border bg-surface px-4 py-[10px] text-text placeholder:text-muted placeholder:opacity-100 aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-error-strong';
export const authSubmitClass = "auth-submit mt-[14px] inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-[10px] border border-transparent bg-primary px-5 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-text cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:not-disabled:bg-primary-hover active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 disabled:cursor-default disabled:bg-border disabled:text-muted disabled:opacity-100!";

export function AuthFrame({ title, description, register, children }: {
  title: string;
  description: string;
  register?: boolean;
  children: ReactNode;
}) {
  return <section className={`auth-flow mx-auto grid w-full max-w-[600px] grid-cols-1 min-[1101px]:mx-0 min-[1101px]:max-w-[1288px] min-[1101px]:grid-cols-[minmax(0,520px)_minmax(0,600px)] min-[1101px]:items-start min-[1101px]:justify-between min-[1101px]:gap-[clamp(24px,6vw,86px)]${register ? ' auth-register' : ''}`}>
    <div className="hidden min-[1101px]:block min-[1101px]:pt-[76px]">
      <h2 className="max-w-[520px] text-[42px] leading-[1.2]">Estudia mejor, en compañía.</h2>
      <p className="max-w-[470px] text-lg text-muted">Un lugar para reunirte, conversar y avanzar en tus cursos con tu equipo.</p>
      <StudyIllustration />
      <p className="mt-[38px] flex items-center gap-2 text-[13px] text-muted">Acceso privado · Conversaciones dentro de cada sala</p>
    </div>
    <div className="auth-card w-full min-w-0 min-h-0 h-auto overflow-visible rounded-[24px] border border-border bg-auth-surface p-5 min-[1101px]:px-[clamp(28px,3.62vw,52px)] min-[1101px]:py-[34px] [&_h1]:text-2xl [&_h1]:leading-[1.25] [&_h1]:[overflow-wrap:anywhere] min-[1101px]:[&_h1]:text-[32px] [&>p]:mt-[14px] [&>p]:text-base [&>p]:text-muted [&>p]:[overflow-wrap:anywhere]">
      <PageTitle title={title} />
      <p>{description}</p>
      {children}
    </div>
  </section>;
}

function PasswordToggle({ visible, onClick, label }: { visible: boolean; onClick: () => void; label: string }) { return <button className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg border-0 bg-transparent p-0 text-muted transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none hover:bg-subtle hover:text-text [&_svg]:h-[19px] [&_svg]:w-[19px]" type="button" onClick={onClick} aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`} title={visible ? `Ocultar ${label}` : `Mostrar ${label}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />{visible ? <circle cx="12" cy="12" r="2.5" /> : <path d="m4 4 16 16" />}</svg></button>; }
export function AuthPage({ register = false }: { register?: boolean }) {
  const [errors, setErrors] = useState<Record<string, string>>({}); const location = useLocation(); const accountDeleted = useAccountDeletionCompleted(); const [authStatus, setAuthStatus] = useState<AuthStatus>('idle'); const [serverError, setServerError] = useState(() => typeof location.state?.authMessage === 'string' ? location.state.authMessage : ''); const [showPassword, setShowPassword] = useState(false); const [showConfirmPassword, setShowConfirmPassword] = useState(false); const [passwordHelpOpen, setPasswordHelpOpen] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState(() => location.state?.googleError === true);
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(null); const navigate = useNavigate(); const auth = useOptionalAuth();
  const passwordHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const passwordHelpCloseRef = useRef<HTMLButtonElement>(null);
  const wasPasswordHelpOpenRef = useRef(false);
  useEffect(() => {
    if (passwordHelpOpen) {
      wasPasswordHelpOpenRef.current = true;
      passwordHelpCloseRef.current?.focus();
    } else if (wasPasswordHelpOpenRef.current) {
      wasPasswordHelpOpenRef.current = false;
      passwordHelpTriggerRef.current?.focus();
    }
  }, [passwordHelpOpen]);
  useEffect(() => { if (!passwordHelpOpen) return; const closeWithEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPasswordHelpOpen(false); }; document.addEventListener('keydown', closeWithEscape); return () => document.removeEventListener('keydown', closeWithEscape); }, [passwordHelpOpen]);
  const fields = register ? [{ name: 'nombre', label: 'Nombre', placeholder: 'Tu nombre', type: 'text', autoComplete: 'given-name' }, { name: 'apellido', label: 'Apellido', placeholder: 'Tu apellido', type: 'text', autoComplete: 'family-name' }, { name: 'email', label: 'Correo electrónico', placeholder: 'nombre@universidad.edu', type: 'email', autoComplete: 'email' }, { name: 'password', label: 'Contraseña', placeholder: '••••••••••••', type: 'password', autoComplete: 'new-password' }, { name: 'confirm', label: 'Confirmar contraseña', placeholder: '••••••••••••', type: 'password', autoComplete: 'new-password' }] : [{ name: 'email', label: 'Correo electrónico', placeholder: 'nombre@universidad.edu', type: 'email', autoComplete: 'username' }, { name: 'password', label: 'Contraseña', placeholder: '••••••••••••', type: 'password', autoComplete: 'current-password' }];
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (authStatus === 'loading') return; const form = event.currentTarget; const data = new FormData(form); const next: Record<string, string> = {}; for (const field of fields) if (!String(data.get(field.name) ?? '').trim()) next[field.name] = `Completa el campo ${field.label.toLowerCase()}.`; if (data.get('email') && !isValidEmail(String(data.get('email')))) next.email = 'Introduce un correo electrónico válido.'; if (register && String(data.get('password') ?? '').length < 6) next.password = 'La contraseña debe tener al menos 6 caracteres.'; if (register && isValidEmail(String(data.get('password') ?? ''))) next.password = 'La contraseña no puede ser un correo electrónico. Usa una combinación de letras, números y símbolos.'; if (register && data.get('confirm') && data.get('password') !== data.get('confirm')) next.confirm = 'Las contraseñas no coinciden.'; setErrors(next); setServerError(''); setErrorField(null); if (Object.keys(next).length) { setAuthStatus('idle'); form.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)?.focus(); return; } setAuthStatus('loading'); try { const result = register ? await registerUser({ nombre: String(data.get('nombre')), apellido: String(data.get('apellido')), email: String(data.get('email')), password: String(data.get('password')) }) : await loginUser({ email: String(data.get('email')), password: String(data.get('password')) }); auth?.setUser(result.user); setAuthStatus('success'); navigate(register ? '/verificar-correo' : result.user.profileError ? '/perfil' : result.user.username ? '/dashboard' : '/completar-username'); } catch (error) { setAuthStatus('error');
      if (error instanceof AuthError && error.code === 'auth/email-already-in-use') setErrorField('email');
      if (error instanceof AuthError && error.code === 'auth/invalid-credential') setErrorField('password');
      setServerError(error instanceof AuthError ? error.message : 'No pudimos completar la solicitud. Inténtalo de nuevo.'); } }
  async function google() {
    setGooglePending(true);
    setGoogleError(false);
    setErrorField(null);
    setAuthStatus('loading');
    setServerError(''); try { const result = await continueWithGoogle(); auth?.setUser(result.user); navigate(result.user.profileError ? '/perfil' : result.user.username ? '/dashboard' : '/completar-username'); } catch (error) { const message = error instanceof AuthError && error.code === 'auth/popup-closed-by-user' ? 'Inicio con Google cancelado. Puedes intentarlo de nuevo cuando quieras.' : error instanceof AuthError ? error.message : 'No pudimos continuar con Google. Inténtalo de nuevo.'; setGooglePending(false);
      setGoogleError(true);
      setAuthStatus('idle');
      setServerError(message);
      navigate('/login', { replace: true, state: { authMessage: message, googleError: true } }); } }
  function clearFieldState(fieldName: string) { setAuthStatus('idle'); setServerError(''); setErrorField(null); setErrors(current => ({ ...current, [fieldName]: '' })); }
  const pending = authStatus === 'loading';
  const title = googlePending ? 'Conectando con Google' : googleError ? 'No pudimos continuar con Google'
    : register ? 'Crear cuenta' : 'Bienvenido de nuevo';
  const description = googlePending ? 'Espera un momento mientras confirmamos tu cuenta.'
    : googleError ? 'Intenta otra vez o vuelve al ingreso.'
    : pending ? (register ? 'Estamos creando tu cuenta.' : 'Estamos verificando tus datos.')
    : register ? 'Crea tu cuenta para estudiar y colaborar en tus Salas.' : 'Ingresa a tu cuenta para continuar estudiando.';

  return <AuthFrame title={title} description={description} register={register}>
    <div hidden={googlePending || googleError}>
      <form className="mt-[14px]" noValidate onSubmit={submit} aria-busy={pending}>
        {!register && accountDeleted && <p className="mt-5 rounded-[14px] border border-[#286a56] bg-[#103c30] px-[18px] py-[14px] font-semibold text-success" role="status">El servidor confirmó la eliminación de tu cuenta.</p>}
        <div className={`${authFieldsClass}${register ? ' min-[370px]:grid-cols-2 min-[370px]:gap-x-3 min-[370px]:[&>*:nth-child(n+3)]:col-span-full' : ''}`}>
          {fields.map(field => {
            const isPassword = field.name === 'password' || field.name === 'confirm';
            const visible = field.name === 'confirm' ? showConfirmPassword : showPassword;
            const message = errors[field.name] || (errorField === field.name ? serverError : '');
            const inputProps = {
              id: `auth-${field.name}`, name: field.name, autoComplete: field.autoComplete,
              required: true, 'aria-invalid': Boolean(message),
              'aria-describedby': message ? `error-${field.name}` : undefined,
              onChange: () => clearFieldState(field.name),
            };
            return <div className={`${authFieldClass} auth-field-${field.name}`} key={field.name}>
              <div className="flex items-baseline justify-between gap-3">
                <label className={authLabelClass} htmlFor={inputProps.id}>{field.label}</label>
                {register && field.name === 'password' && <button ref={passwordHelpTriggerRef} className="min-h-[28px] border-0 bg-transparent py-0.5 text-xs text-link underline underline-offset-[3px] transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none hover:text-link-strong" type="button" onClick={() => setPasswordHelpOpen(true)}>¿Qué contraseña usar?</button>}
              </div>
              {isPassword ? <div className="relative [&>input]:pr-[52px]">
                <input {...inputProps} className={`${authInputClass}${register ? ' aria-[invalid=true]:border aria-[invalid=true]:border-error' : ''}`} type={visible ? 'text' : 'password'}
                  placeholder={field.name === 'confirm' ? 'Repite tu contraseña' : 'Tu contraseña'}
                  minLength={register && field.name === 'password' ? 6 : undefined} />
                <PasswordToggle visible={visible} onClick={() => field.name === 'confirm'
                  ? setShowConfirmPassword(value => !value) : setShowPassword(value => !value)} label={field.label.toLowerCase()} />
              </div> : <input {...inputProps} className={`${authInputClass}${register ? ' aria-[invalid=true]:border aria-[invalid=true]:border-error' : ''}`} type={field.type} placeholder={field.placeholder} />}
              {message && <p className={register ? 'mt-1 text-sm text-error' : 'mt-1 text-[13px] text-[#ffa5a5]'} id={`error-${field.name}`} role="alert">{message}</p>}
            </div>;
          })}
        </div>
        {serverError && !errorField && !googleError && <p className="mt-[14px] rounded-lg border border-[#fca5a5] bg-[#33151b] px-3 py-[10px] text-[13px] leading-[19px] text-[#fca5a5] [overflow-wrap:anywhere]" role="alert">{serverError}</p>}
        {!register && !pending && <p className="mt-2 block min-h-0 text-right text-[13px] text-link [&_a]:transition-[background-color,border-color,color] [&_a]:duration-[120ms] [&_a]:ease-out motion-reduce:[&_a]:transition-none"><Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link></p>}
        <button className={authSubmitClass} type="submit" disabled={pending}>
          {pending ? (register ? 'Creando…' : 'Ingresando…') : register ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>
      {!pending && <div className="mt-[14px] grid gap-[14px] [&>*]:m-0">
        <button className="inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-[10px] border border-input-border bg-surface px-5 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-text cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:not-disabled:bg-subtle active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 [&>span]:text-[17px] [&>span]:text-[#4285f4]" type="button" onClick={() => void google()}><span aria-hidden="true">G</span>Continuar con Google</button>
        <p className="text-center text-sm [&_a]:m-0 [&_a]:block [&_a]:py-2 [&_a]:font-semibold [&_a]:text-link [&_a]:transition-[background-color,border-color,color] [&_a]:duration-[120ms] [&_a]:ease-out motion-reduce:[&_a]:transition-none"><Link to={register ? '/login' : '/registro'}>{register ? 'Inicia sesión' : 'Crear una cuenta'}</Link></p>
        {!register && <p className="text-center text-xs text-muted">Al continuar aceptas las condiciones de uso y privacidad.</p>}
      </div>}
    </div>
    {googlePending && <button className={authSubmitClass} type="button" disabled>Conectando…</button>}
    {googleError && <div className="mt-[14px] grid gap-[14px] [&>*]:m-0">
      <p className="mt-[14px] rounded-lg border border-[#fca5a5] bg-[#33151b] px-3 py-[10px] text-[13px] leading-[19px] text-[#fca5a5] [overflow-wrap:anywhere]" role="alert">{serverError}</p>
      <button className={authSubmitClass} type="button" onClick={() => void google()}>Reintentar</button>
      <Link className="m-0 block py-2 text-center text-sm font-semibold text-link transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none" to="/login" replace onClick={() => { setGoogleError(false); setServerError(''); }}>Volver al ingreso</Link>
    </div>}
    {passwordHelpOpen && <div className="fixed inset-0 z-20 grid place-items-center [align-items:safe_center] overflow-auto bg-overlay p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPasswordHelpOpen(false); }}><div className="relative max-h-[calc(100dvh-40px)] w-full max-w-[390px] overflow-auto rounded-2xl border border-border-strong bg-surface p-7 shadow-[0_24px_60px_rgb(2_6_23_/_40%)] [&_h2]:pr-6 [&_h2]:text-[21px] [&_h2]:leading-7 [&>p]:mt-[10px] [&>p]:text-sm [&>p]:leading-5 [&>p]:text-muted [&_ul]:mt-[18px] [&_ul]:grid [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:leading-5 [&_ul]:text-muted [&_li]:marker:text-link" role="dialog" aria-modal="true" aria-labelledby="password-help-title"><button ref={passwordHelpCloseRef} className="absolute top-3 right-[14px] grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-[25px] leading-none text-muted transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none hover:bg-subtle hover:text-text" type="button" aria-label="Cerrar ayuda para crear contraseña" onClick={() => setPasswordHelpOpen(false)}>×</button><h2 id="password-help-title">Crea una contraseña segura</h2><p>Usa una combinación que puedas recordar, pero que otras personas no puedan adivinar.</p><ul><li>Debe tener al menos 6 caracteres.</li><li>Combina letras, números y símbolos.</li><li>No uses tu nombre, correo o una contraseña repetida.</li><li>No compartas tu contraseña con otras personas.</li></ul><button className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-3 rounded-[10px] border border-link bg-primary px-5 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-text cursor-pointer hover:bg-primary-hover" type="button" onClick={() => setPasswordHelpOpen(false)}>Entendido</button></div></div>}
  </AuthFrame>;
}
export function LoginPage() { return <AuthPage />; }
export function RegisterPage() { return <AuthPage register />; }
