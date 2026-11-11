import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageContent } from './PageContent';
import { PageTitle } from '../components/PageTitle';
import { useAuth } from '../auth/AuthContext';
import { AuthError, isUsernameAvailable, saveUsername } from '../services/auth';
import { StudyIllustration } from './AuthPages';
function ContentPage({ title, children }: { title: string; children: ReactNode }) { return <PageContent title={title}><p className="max-w-2xl text-lg leading-8 text-slate-300">{children}</p></PageContent>; }
type UsernameStatus = 'idle' | 'loading' | 'error' | 'success';
export function CompleteUsernamePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username ?? '');
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = username.trim().toLowerCase();
    if (!normalized) { setStatus('error'); setError('Escribe un nombre de usuario.'); return; }
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(normalized) || normalized.length < 3 || normalized.length > 20) { setStatus('error'); setError('Usa entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.'); return; }
    setStatus('loading'); setError('');
    try {
      if (!await isUsernameAvailable(normalized)) { setStatus('error'); setError('Ese nombre ya está en uso. Prueba con ana.martinez.'); return; }
      const result = await saveUsername(normalized);
      setUser(result.user); setStatus('success');
    } catch (requestError) {
      setStatus('error'); setError(requestError instanceof AuthError ? requestError.message : 'No pudimos guardar tu nombre. Inténtalo de nuevo.');
    }
  };
  if (status === 'success') return <section className="auth-layout username-layout"><div className="auth-intro"><h2>Estudia mejor, en compañía.</h2><p>Un lugar para reunirte, conversar y avanzar en tus cursos con tu equipo.</p><StudyIllustration /><p className="private-note">Acceso privado · Conversaciones dentro de cada sala</p></div><div className="auth-card username-card"><PageTitle title="Tu cuenta está lista" /><p>Guardamos tu nombre de usuario. Ya puedes acceder a tus salas.</p><Link className="button primary username-submit" to="/dashboard">Ir a mis salas</Link></div></section>;
  return <section className="auth-layout username-layout"><div className="auth-intro"><h2>Estudia mejor, en compañía.</h2><p>Un lugar para reunirte, conversar y avanzar en tus cursos con tu equipo.</p><StudyIllustration /><p className="private-note">Acceso privado · Conversaciones dentro de cada sala</p></div><div className="auth-card username-card"><PageTitle title="Elige tu nombre de usuario" /><p>{status === 'loading' ? 'Estamos guardando tu nombre de usuario.' : 'Usarás este nombre para identificarte en Salón.'}</p><form noValidate onSubmit={submit} aria-busy={status === 'loading'}><div className="form-field"><label htmlFor="username">Nombre de usuario</label><input id="username" name="username" type="text" placeholder="Ejemplo: ana.martinez" value={username} aria-invalid={status === 'error'} aria-describedby={error ? 'username-error' : undefined} onChange={event => { setUsername(event.target.value); setStatus('idle'); setError(''); }} /></div>{error && <p className="field-error" id="username-error" role="alert">{error}</p>}<button className="button primary username-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Guardando…' : 'Guardar nombre'}</button><Link className="username-cancel" to="/login">Cancelar</Link></form></div></section>;
}

export function ProfilePage() { return <ContentPage title="Mi perfil">Consulta y actualiza tus datos personales cuando la sesión esté habilitada.</ContentPage>; }
export function HelpPage() { return <ContentPage title="Ayuda">Encuentra orientación para registrarte, ingresar y participar en salas de estudio colaborativo.</ContentPage>; }
export function AccessibilityPage() { return <ContentPage title="Accesibilidad">TeamSpeak está pensado para usarse con teclado, foco visible y lectores de pantalla. Consulta esta página para conocer las ayudas disponibles.</ContentPage>; }
export function LoggedOutPage() { return <PageContent title="Sesión cerrada"><p>Saliste de tu cuenta de Salón.</p><Link className="button primary" to="/login">Volver al ingreso</Link></PageContent>; }
export function NotFoundPage() { return <PageContent eyebrow="Error 404" title="Página no encontrada"><p className="text-lg text-slate-300">La dirección que buscas no existe en TeamSpeak.</p><Link className="mt-6 inline-block font-semibold text-blue-300 underline underline-offset-4" to="/login">Volver al ingreso</Link></PageContent>; }

export function RecoveryPage() { return <PageContent title="Recuperar contraseña"><p>La recuperación de contraseña estará disponible cuando se habilite la autenticación.</p><Link className="button secondary" to="/login">Volver al ingreso</Link></PageContent>; }
