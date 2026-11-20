import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { useAuth } from '../auth/AuthContext';
import { AuthError, completeProfile, refreshCurrentUser, resendVerification, resetPassword } from '../services/auth';
import { ApiError } from '../services/api';
import { AuthFrame } from './AuthPages';
type AuthNotice = { tone: 'info' | 'success' | 'error'; message: string };

function AuthFeedback({ notice }: { notice: AuthNotice | null }) {
  return notice && <p role="status" className={`auth-state auth-feedback-${notice.tone}`}>{notice.message}</p>;
}

export function EmailVerificationPage() {
  const { user, setUser } = useAuth();
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function check() {
    setLoading(true);
    try {
      const refreshedUser = await refreshCurrentUser();
      if (refreshedUser?.emailVerified && user) {
        setUser({ ...user, emailVerified: true });
        navigate(user.username ? '/dashboard' : '/completar-username');
      } else {
        setNotice({ tone: 'info', message: 'Tu correo todavía no está verificado. Revisa tu bandeja de entrada.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos comprobar la verificación.' });
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      await resendVerification();
      setNotice({ tone: 'success', message: 'Enviamos un nuevo correo de verificación.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos enviar el correo.' });
    }
  }

  return <AuthFrame title="Verifica tu correo"
    description={loading ? 'Estamos comprobando la verificación.' : `Enviamos un enlace de verificación a ${user?.email ?? 'tu correo'}.`}>
    <AuthFeedback notice={notice} />
    <div className="auth-alternatives">
      <button className="button primary auth-submit" type="button" onClick={() => void check()} disabled={loading}>
        {loading ? 'Comprobando…' : 'Ya verifiqué mi correo'}
      </button>
      <button className="button secondary auth-submit auth-secondary" type="button" onClick={() => void resend()}>Reenviar correo</button>
    </div>
  </AuthFrame>;
}

type UsernameStatus = 'idle' | 'loading' | 'error' | 'success';

export function CompleteUsernamePage() {
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = username.trim();
    if (!/^[A-Za-z0-9_-]{8,30}$/.test(normalized)) {
      setStatus('error');
      setError('Usa entre 8 y 30 caracteres: letras, números, guion o guion bajo.');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const result = await completeProfile(normalized);
      setUser(result.user);
      setStatus('success');
    } catch (requestError) {
      setStatus('error');
      setError(requestError instanceof AuthError || requestError instanceof ApiError
        ? requestError.message : 'No pudimos guardar tu nombre.');
    }
  }

  if (status === 'success') {
    return <AuthFrame title="Tu cuenta está lista" description="Guardamos tu nombre de usuario. Ya puedes acceder a tus salas.">
      <Link className="button primary auth-submit" to="/dashboard">Ir a mis salas</Link>
    </AuthFrame>;
  }
  return <AuthFrame title="Elige tu nombre de usuario" description={status === 'loading'
    ? 'Estamos guardando tu nombre de usuario.' : 'Usarás este nombre para identificarte en TeamSpeak.'}>
    <form className="auth-credentials" noValidate onSubmit={submit} aria-busy={status === 'loading'}>
      <div className="auth-fields">
        <div className="form-field">
          <label htmlFor="username">Nombre de usuario</label>
          <input id="username" value={username} placeholder="Ejemplo: ana_martinez" aria-invalid={Boolean(error)}
            aria-describedby={error ? 'username-error' : undefined}
            onChange={event => { setUsername(event.target.value); setStatus('idle'); setError(''); }} />
          {error && <p className="field-error" id="username-error" role="alert">{error}</p>}
        </div>
      </div>
      <button className="button primary auth-submit" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Guardando…' : 'Guardar nombre'}
      </button>
    </form>
  </AuthFrame>;
}

export function RecoveryPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      setNotice({ tone: 'success', message: 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos procesar la solicitud.' });
    } finally {
      setLoading(false);
    }
  }
  return <AuthFrame title="Recuperar contraseña" description="Te enviaremos un enlace al correo asociado a tu cuenta.">
    <form className="auth-credentials" onSubmit={submit} aria-busy={loading}>
      <div className="auth-fields">
        <div className="form-field">
          <label htmlFor="recovery-email">Correo electrónico</label>
          <input id="recovery-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required />
        </div>
      </div>
      <AuthFeedback notice={notice} />
      <button className="button primary auth-submit" type="submit" disabled={loading}>{loading ? 'Enviando…' : 'Enviar enlace'}</button>
    </form>
    <Link className="auth-return" to="/login">Volver al ingreso</Link>
  </AuthFrame>;
}
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
export function AccessibilityPage() {
  return <section className="page-panel help-page">
    <div className="help-intro">
      <p className="eyebrow">Accesibilidad · WCAG 2.2 AA</p>
      <PageTitle title="Accesibilidad" />
      <p>TeamSpeak está pensado para usarse con teclado, foco visible y lectores de pantalla. Consulta esta página para conocer las ayudas disponibles.</p>
    </div>
    <div className="help-grid">
      <section className="help-section" aria-labelledby="a11y-keyboard-title">
        <h2 id="a11y-keyboard-title">Teclado y foco visible</h2>
        <p>Recorre todas las pantallas y diálogos sin depender del puntero.</p>
        <ul>
          <li><strong>Saltar al contenido:</strong> presiona <em>Tab</em> al cargar una página para ir directo al bloque principal.</li>
          <li><strong>Doble anillo de foco:</strong> contorno exterior claro de 3 px con separación oscura de 2 px en botones, enlaces y campos.</li>
          <li><strong>Control de diálogos:</strong> cierra modales con <em>Escape</em> y conserva el foco en el botón que inició la acción.</li>
        </ul>
      </section>
      <section className="help-section" aria-labelledby="a11y-contrast-title">
        <h2 id="a11y-contrast-title">Contraste y señales visuales</h2>
        <p>La paleta nocturna cumple las relaciones de contraste de lectura continua.</p>
        <ul>
          <li><strong>Texto principal:</strong> contraste aproximado de 17.4:1 sobre superficies oscuras.</li>
          <li><strong>Estados no solo cromáticos:</strong> los errores, alertas y controles de micrófono o cámara incluyen iconos y etiquetas explícitas.</li>
          <li><strong>Movimiento reducido:</strong> las animaciones de carga respetan la preferencia <em>prefers-reduced-motion</em> del sistema.</li>
        </ul>
      </section>
      <section className="help-section" aria-labelledby="a11y-screenreader-title">
        <h2 id="a11y-screenreader-title">Lectores de pantalla y formularios</h2>
        <p>Cada formulario y sala informa sus cambios de estado de forma programática.</p>
        <ul>
          <li><strong>Etiquetas y ayuda:</strong> todos los campos cuentan con etiqueta asociada y mensajes vinculados mediante <em>aria-describedby</em>.</li>
          <li><strong>Avisos en vivo:</strong> las regiones <em>status</em> y <em>alert</em> anuncian validaciones, progreso y mensajes del chat.</li>
        </ul>
      </section>
      <section className="help-section" aria-labelledby="a11y-responsive-title">
        <h2 id="a11y-responsive-title">Diseño adaptable</h2>
        <p>La interfaz se ajusta a escritorio, tablet y móvil sin pérdida de contenido.</p>
        <ul>
          <li><strong>Áreas táctiles:</strong> botones y controles interactivos mantienen un objetivo mínimo de 44 × 44 px.</li>
          <li><strong>Sin desbordamiento:</strong> las vistas se adaptan desde 320 px de ancho hasta 1440 px conservando todas las acciones.</li>
        </ul>
        <div className="help-links"><Link to="/ayuda">Centro de ayuda</Link><Link to="/login">Ir al ingreso</Link></div>
      </section>
    </div>
  </section>;
}
export function LoggedOutPage() {
  return <AuthFrame title="Sesión cerrada" description="Saliste de tu cuenta de TeamSpeak.">
    <Link className="button primary auth-submit" to="/login">Volver al ingreso</Link>
  </AuthFrame>;
}
export function NotFoundPage() {
  return <section className="page-panel status-page-panel">
    <p className="eyebrow">Error 404</p>
    <PageTitle title="Página no encontrada" />
    <p className="status-page-description">La dirección que buscas no existe en TeamSpeak.</p>
    <div className="status-page-actions">
      <Link className="button primary" to="/login">Volver al ingreso</Link>
      <Link className="button secondary" to="/ayuda">Centro de ayuda</Link>
    </div>
  </section>;
}
