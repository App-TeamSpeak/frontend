import { PageTitle } from '../components/PageTitle';

export type AuthShowcaseContext = 'login' | 'register';
export type AuthShowcaseState = 'loading' | 'error' | 'success';

const stateContent = {
  login: {
    loading: { badge: 'CARGANDO', title: 'Validando tus credenciales…', description: 'Botón deshabilitado con indicador de progreso.' },
    error: { badge: 'ERROR', title: 'No pudimos iniciar sesión', description: 'Verifica el usuario y la contraseña e inténtalo otra vez.' },
    success: { badge: 'ÉXITO', title: 'Sesión iniciada correctamente', description: 'Te estamos llevando a tus salas.' },
  },
  register: {
    loading: { badge: 'CARGANDO', title: 'Validando los datos…', description: 'Botón deshabilitado con indicador de progreso.' },
    error: { badge: 'ERROR', title: 'No pudimos crear tu cuenta', description: 'Revisa los campos marcados e inténtalo otra vez.' },
    success: { badge: 'ÉXITO', title: 'Cuenta creada correctamente', description: 'Tu cuenta está lista para comenzar a estudiar.' },
  },
} satisfies Record<AuthShowcaseContext, Record<AuthShowcaseState, { badge: string; title: string; description: string }>>;

export function AuthStateCard({ context, state }: { context: AuthShowcaseContext; state: AuthShowcaseState }) {
  const content = stateContent[context][state];
  return <article className={`auth-showcase-card auth-state-${state}`} aria-label={`${context === 'login' ? 'Login' : 'Registro'} · ${content.badge}`}>
    <span className="auth-state-badge">{content.badge}</span>
    <strong>{content.title}</strong>
    <p>{content.description}</p>
  </article>;
}

function AuthShowcaseSection({ context }: { context: AuthShowcaseContext }) {
  const label = context === 'login' ? 'Login' : 'Registro';
  return <section className="auth-showcase-section" aria-labelledby={`showcase-${context}`}>
    <h2 id={`showcase-${context}`}>{label}</h2>
    <div className="auth-showcase-grid">
      <AuthStateCard context={context} state="loading" />
      <AuthStateCard context={context} state="error" />
      <AuthStateCard context={context} state="success" />
    </div>
    <p className="auth-showcase-initial"><strong>Vacío / inicial:</strong> formulario limpio con placeholders, sin mensajes de error y con el botón disponible.</p>
  </section>;
}

export function AuthStatesShowcasePage() {
  return <section className="auth-showcase">
    <PageTitle title="Estados del sistema · Autenticación" />
    <p className="auth-showcase-description">Referencia visual de los estados de validación para iniciar sesión y crear una cuenta.</p>
    <AuthShowcaseSection context="login" />
    <AuthShowcaseSection context="register" />
  </section>;
}
