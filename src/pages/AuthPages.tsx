import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { useOptionalAuth } from '../auth/AuthContext';
import { AuthError, loginUser, registerUser } from '../services/auth';

type AuthStatus = 'idle' | 'loading' | 'error' | 'success';

export function StudyIllustration() {
  return <div className="study-illustration" aria-hidden="true"><div className="study-card"><div className="study-tiles"><div /><div /></div><div className="study-note"><strong>Una sala para cada proyecto</strong><p>Ideas, voz y pantalla compartida.</p></div></div><span className="study-badge">EN TIEMPO REAL</span></div>;
}

export function AuthPage({ register = false }: { register?: boolean }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [serverError, setServerError] = useState('');
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const fields = register
    ? [{ name: 'name', label: 'Nombre', placeholder: 'Tu nombre', type: 'text', autoComplete: 'name' }, { name: 'email', label: 'Correo electrónico', placeholder: 'nombre@universidad.edu', type: 'email', autoComplete: 'email' }, { name: 'password', label: 'Contraseña', placeholder: '••••••••••••', type: 'password', autoComplete: 'new-password' }, { name: 'confirm', label: 'Confirmar contraseña', placeholder: '••••••••••••', type: 'password', autoComplete: 'new-password' }]
    : [{ name: 'user', label: 'Usuario o correo electrónico', placeholder: 'nombre@universidad.edu', type: 'text', autoComplete: 'username' }, { name: 'password', label: 'Contraseña', placeholder: '••••••••••••', type: 'password', autoComplete: 'current-password' }];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authStatus === 'loading') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const next: Record<string, string> = {};
    for (const field of fields) if (!String(data.get(field.name) ?? '').trim()) {
      next[field.name] = !register && field.name === 'user'
        ? 'Ingresa tu usuario o correo electrónico'
        : !register && field.name === 'password'
          ? 'Ingresa tu contraseña'
          : `Completa el campo ${field.label.toLowerCase()}.`;
    }
    if (register && data.get('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.get('email')))) next.email = 'Introduce un correo electrónico válido.';
    if (register && data.get('confirm') && data.get('password') !== data.get('confirm')) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    setServerError('');
    if (Object.keys(next).length) {
      setAuthStatus('idle');
      form.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    setAuthStatus('loading');
    const request = register
      ? registerUser({ name: String(data.get('name')), email: String(data.get('email')), password: String(data.get('password')) })
      : loginUser({ identifier: String(data.get('user')), password: String(data.get('password')) });
    request.then(result => {
      auth?.setUser(result.user);
      setAuthStatus('success');
      navigate(register ? '/completar-username' : '/dashboard');
    }).catch((error: unknown) => {
      setAuthStatus('error');
      setServerError(error instanceof AuthError ? error.message : 'No pudimos completar la solicitud. Inténtalo de nuevo.');
    });
  }
  function clearFieldState(fieldName: string) {
    setAuthStatus('idle');
    setServerError('');
    setErrors(current => ({ ...current, [fieldName]: '' }));
  }
  return <section className={`auth-layout ${register ? 'auth-register' : ''}`}>
    <div className="auth-intro"><h2>Estudia mejor, en compañía.</h2><p>Un lugar para reunirte, conversar y avanzar en tus cursos con tu equipo.</p><StudyIllustration /><p className="private-note">Acceso privado · Conversaciones dentro de cada sala</p></div>
    <div className="auth-card"><PageTitle title={register ? 'Crear cuenta' : 'Bienvenido de nuevo'} /><p>{register ? 'Crea tu cuenta para estudiar y colaborar en tus Salas.' : 'Ingresa a tu cuenta para continuar estudiando.'}</p>
      <form noValidate onSubmit={submit} aria-busy={authStatus === 'loading'}>
        {fields.map(field => <div className="form-field" key={field.name}><label htmlFor={`auth-${field.name}`}>{field.label}</label><input id={`auth-${field.name}`} name={field.name} type={field.type} placeholder={field.placeholder} autoComplete={field.autoComplete} required aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `error-${field.name}` : undefined} onChange={() => clearFieldState(field.name)} />{errors[field.name] && <p className="field-error" id={`error-${field.name}`}>{errors[field.name]}</p>}</div>)}
        {serverError && <p className="auth-server-error" role="alert">{serverError}</p>}
        {!register && <p className="forgot-link">¿Olvidaste tu contraseña?</p>}
        <button className="button primary auth-submit" type="submit" disabled={authStatus === 'loading'}>{authStatus === 'loading' ? (register ? 'Creando…' : 'Ingresando…') : register ? 'Crear cuenta' : 'Ingresar'}</button>
      </form>
      <div className="auth-divider">O continúa con</div><button className="button google-button" type="button" disabled={authStatus === 'loading'}><span aria-hidden="true">G</span>Registro con Google</button>
      <p className="auth-switch">{register ? '¿Ya tienes una cuenta?' : '¿Aún no tienes cuenta?'} <Link to={register ? '/login' : '/registro'}>{register ? 'Inicia sesión' : 'Crear una cuenta'}</Link></p>
      {!register && <p className="auth-terms">Al continuar aceptas las condiciones de uso y privacidad.</p>}
    </div>
  </section>;
}
export function LoginPage() { return <AuthPage />; }
export function RegisterPage() { return <AuthPage register />; }
