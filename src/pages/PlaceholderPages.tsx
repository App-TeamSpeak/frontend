import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageContent } from './PageContent';
import { PageTitle } from '../components/PageTitle';
import { useAuth } from '../auth/AuthContext';
import { AuthError, completeProfile, deleteUserAccount, refreshCurrentUser, resendVerification, resetPassword, updateUserProfile } from '../services/auth';
import { ApiError } from '../services/api';
import { StudyIllustration } from './AuthPages';
function ContentPage({ title, children }: { title: string; children: ReactNode }) { return <PageContent title={title}><p className="max-w-2xl text-lg leading-8 text-slate-300">{children}</p></PageContent>; }
export function EmailVerificationPage() { const { user, setUser } = useAuth(); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false); const navigate = useNavigate(); async function check() { setLoading(true); try { const refreshedUser = await refreshCurrentUser(); if (refreshedUser?.emailVerified && user) { setUser({ ...user, emailVerified: true }); navigate(user.username ? '/dashboard' : '/completar-username'); } else setMessage('Tu correo todavía no está verificado. Revisa tu bandeja de entrada.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos comprobar la verificación.'); } finally { setLoading(false); } } return <section className="auth-layout username-layout"><div className="auth-intro"><h2>Confirma tu correo.</h2><p>Verifica tu dirección para proteger tu cuenta y acceder a tus salas.</p><StudyIllustration /><p className="private-note">Sesiones seguras · Cuenta protegida</p></div><div className="auth-card username-card"><PageTitle title="Verifica tu correo" /><p>Enviamos un enlace de verificación a {user?.email}.</p>{message && <p className="auth-state" role="status">{message}</p>}<div className="room-management-dialog-actions"><button className="button primary" type="button" onClick={() => void check()} disabled={loading}>{loading ? 'Comprobando…' : 'Ya verifiqué mi correo'}</button><button className="button secondary" type="button" onClick={async () => { try { await resendVerification(); setMessage('Enviamos un nuevo correo de verificación.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos enviar el correo.'); } }}>Reenviar correo</button></div></div></section>; }
type UsernameStatus = 'idle' | 'loading' | 'error' | 'success';
export function CompleteUsernamePage() { const { user, setUser } = useAuth(); const [username, setUsername] = useState(user?.username ?? ''); const [status, setStatus] = useState<UsernameStatus>('idle'); const [error, setError] = useState(''); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const normalized = username.trim(); if (!/^[A-Za-z0-9_-]{8,30}$/.test(normalized)) { setStatus('error'); setError('Usa entre 8 y 30 caracteres: letras, números, guion o guion bajo.'); return; } setStatus('loading'); setError(''); try { const result = await completeProfile(normalized); setUser(result.user); setStatus('success'); } catch (requestError) { setStatus('error'); setError(requestError instanceof AuthError || requestError instanceof ApiError ? requestError.message : 'No pudimos guardar tu nombre.'); } }; if (status === 'success') return <section className="auth-layout username-layout"><div className="auth-intro"><h2>Estudia mejor, en compañía.</h2><p>Un lugar para reunirte, conversar y avanzar en tus cursos con tu equipo.</p><StudyIllustration /></div><div className="auth-card username-card"><PageTitle title="Tu cuenta está lista" /><p>Guardamos tu nombre de usuario. Ya puedes acceder a tus salas.</p><Link className="button primary username-submit" to="/dashboard">Ir a mis salas</Link></div></section>; return <section className="auth-layout username-layout"><div className="auth-intro"><h2>Estudia mejor, en compañía.</h2><p>Un lugar para reunirte, conversar y avanzar en tus cursos con tu equipo.</p><StudyIllustration /></div><div className="auth-card username-card"><PageTitle title="Elige tu nombre de usuario" /><p>Usarás este nombre para identificarte en TeamSpeak.</p><form noValidate onSubmit={submit} aria-busy={status === 'loading'}><div className="form-field"><label htmlFor="username">Nombre de usuario</label><input id="username" value={username} aria-invalid={status === 'error'} aria-describedby={error ? 'username-error' : undefined} onChange={event => { setUsername(event.target.value); setStatus('idle'); setError(''); }} /></div>{error && <p className="field-error" id="username-error" role="alert">{error}</p>}<button className="button primary username-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Guardando…' : 'Guardar nombre'}</button></form></div></section>; }
export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ nombre: user?.name ?? '', apellido: user?.apellido ?? '', username: user?.username ?? '', avatarUrl: user?.avatarUrl ?? '' });
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      const result = await updateUserProfile({ ...form, avatarUrl: form.avatarUrl.trim() || null });
      setUser(result.user);
      setMessage('Perfil actualizado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos actualizar tu perfil.');
    }
  }

  async function remove() {
    setDeleting(true);
    setMessage('');
    try {
      await deleteUserAccount();
      navigate('/login', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos eliminar tu cuenta.');
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return <section className="page-panel">
    <div className="flex items-center justify-between gap-4">
      <PageTitle title="Mi perfil" />
      <Link className="button secondary" to="/dashboard">Volver a mis salas</Link>
    </div>
    <p className="max-w-2xl text-lg leading-8 text-slate-300">Administra tus datos personales y tu nombre de usuario.</p>
    <form className="profile-form" onSubmit={save} noValidate>
      <div className="form-field"><label htmlFor="profile-name">Nombre</label><input id="profile-name" value={form.nombre} onChange={event => setForm({ ...form, nombre: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="profile-last-name">Apellido</label><input id="profile-last-name" value={form.apellido} onChange={event => setForm({ ...form, apellido: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="profile-username">Nombre de usuario</label><input id="profile-username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} minLength={8} maxLength={30} required /></div>
      <div className="form-field"><label htmlFor="profile-avatar">Avatar HTTPS (opcional)</label><input id="profile-avatar" type="url" value={form.avatarUrl} onChange={event => setForm({ ...form, avatarUrl: event.target.value })} placeholder="https://…" /></div>
      {message && <p role="status" className="auth-state">{message}</p>}
      <div className="room-management-dialog-actions"><button className="button primary" type="submit" disabled={deleting}>Guardar cambios</button><button className="button room-management-dialog-danger" type="button" onClick={() => setDeleteOpen(true)} disabled={deleting}>Eliminar cuenta</button></div>
    </form>
    {deleteOpen && <div className="room-management-dialog-backdrop" role="presentation">
      <div className="room-management-dialog room-management-dialog-delete profile-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
        <h2 id="delete-account-title">¿Eliminar tu cuenta?</h2>
        <p id="delete-account-description">Esta acción solicitará la eliminación de tu cuenta y tus datos. No podrás deshacerla desde TeamSpeak.</p>
        <div className="room-management-dialog-actions"><button className="button secondary" type="button" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancelar</button><button className="button room-management-dialog-danger" type="button" onClick={() => void remove()} disabled={deleting}>{deleting ? 'Eliminando…' : 'Sí, eliminar cuenta'}</button></div>
      </div>
    </div>}
  </section>;
}
export function RecoveryPage() { const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false); async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); try { await resetPassword(email); setMessage('Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos procesar la solicitud.'); } finally { setLoading(false); } } return <section className="page-panel"><PageTitle title="Recuperar contraseña" /><p>Te enviaremos un enlace al correo asociado a tu cuenta.</p><form className="profile-form" onSubmit={submit}><div className="form-field"><label htmlFor="recovery-email">Correo electrónico</label><input id="recovery-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>{message && <p role="status" className="auth-state">{message}</p>}<button className="button primary" type="submit" disabled={loading}>{loading ? 'Enviando…' : 'Enviar enlace'}</button><Link className="button secondary" to="/login">Volver al ingreso</Link></form></section>; }
export function HelpPage() { return <section className="page-panel help-page">
  <div className="help-intro">
    <p className="eyebrow">Centro de ayuda</p>
    <PageTitle title="Ayuda" />
    <p>Encuentra respuestas para crear tu cuenta, entrar a una sala y estudiar con tu equipo.</p>
  </div>
  <nav className="help-navigation" aria-label="Secciones de ayuda">
    <a href="#cuenta">Cuenta</a>
    <a href="#salas">Salas</a>
    <a href="#comunicacion">Comunicación</a>
    <a href="#problemas">Solución de problemas</a>
  </nav>
  <div className="help-grid">
    <section className="help-section" id="cuenta" aria-labelledby="help-account-title">
      <h2 id="help-account-title">Tu cuenta</h2>
      <p>Tu sesión se protege con Firebase Authentication. TeamSpeak nunca solicita ni almacena tu contraseña.</p>
      <ol>
        <li><strong>Crear cuenta:</strong> usa tu correo y contraseña o selecciona <em>Continuar con Google</em>.</li>
        <li><strong>Verificar correo:</strong> revisa tu bandeja de entrada y confirma el enlace antes de entrar a tus salas.</li>
        <li><strong>Completar perfil:</strong> elige un nombre de usuario de 8 a 30 caracteres.</li>
      </ol>
      <div className="help-links"><Link to="/registro">Crear una cuenta</Link><Link to="/recuperar-contrasena">Recuperar contraseña</Link></div>
    </section>
    <section className="help-section" id="salas" aria-labelledby="help-rooms-title">
      <h2 id="help-rooms-title">Salas de estudio</h2>
      <p>Desde <Link to="/dashboard">Mis salas</Link> puedes organizar tus encuentros privados.</p>
      <ul>
        <li>Selecciona <strong>Crear sala</strong> para iniciar una nueva sesión.</li>
        <li>Usa <strong>Unirse a una sala</strong> e ingresa el ID que te compartió otra persona.</li>
        <li>Comparte el ID solo con los participantes autorizados.</li>
        <li>Selecciona <strong>Salir</strong> cuando termines para cerrar tu conexión en tiempo real.</li>
      </ul>
    </section>
    <section className="help-section" id="comunicacion" aria-labelledby="help-communication-title">
      <h2 id="help-communication-title">Chat y controles</h2>
      <p>Dentro de una sala puedes conversar y controlar tu presencia.</p>
      <ul>
        <li>El historial del chat se carga al entrar y los mensajes nuevos aparecen en tiempo real.</li>
        <li>El micrófono y la cámara comienzan apagados por privacidad.</li>
        <li>Activa cada control solo cuando quieras compartir audio o video.</li>
        <li>Compartir pantalla comunica tu estado; la transmisión multimedia completa depende de los permisos del navegador.</li>
      </ul>
    </section>
    <section className="help-section" id="problemas" aria-labelledby="help-troubleshooting-title">
      <h2 id="help-troubleshooting-title">Si algo no funciona</h2>
      <ul>
        <li><strong>No puedo entrar:</strong> confirma tu correo, revisa la contraseña y prueba recuperar el acceso.</li>
        <li><strong>Google no termina:</strong> permite las ventanas emergentes y vuelve a intentar desde el botón de Google.</li>
        <li><strong>No aparece una sala:</strong> comprueba el ID y verifica que tu cuenta tenga permiso para entrar.</li>
        <li><strong>Se perdió la conexión:</strong> revisa tu red y espera la reconexión automática; no cierres la pestaña de inmediato.</li>
        <li><strong>Micrófono o cámara:</strong> habilita los permisos del sitio desde el icono de configuración del navegador.</li>
      </ul>
    </section>
  </div>
</section>; }
export function AccessibilityPage() { return <ContentPage title="Accesibilidad">TeamSpeak está pensado para usarse con teclado, foco visible y lectores de pantalla. Consulta esta página para conocer las ayudas disponibles.</ContentPage>; }
export function LoggedOutPage() { return <PageContent title="Sesión cerrada"><p>Saliste de tu cuenta de TeamSpeak.</p><Link className="button primary" to="/login">Volver al ingreso</Link></PageContent>; }
export function NotFoundPage() { return <PageContent eyebrow="Error 404" title="Página no encontrada"><p className="text-lg text-slate-300">La dirección que buscas no existe en TeamSpeak.</p><Link className="mt-6 inline-block font-semibold text-blue-300 underline underline-offset-4" to="/login">Volver al ingreso</Link></PageContent>; }
