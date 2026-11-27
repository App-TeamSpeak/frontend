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

const stateStyles: Record<AuthShowcaseState, { card: string; badge: string; title: string }> = {
  loading: { card: 'border-[#334155]', badge: 'bg-[#dbeafe] text-[#5c8dff]', title: 'text-text' },
  error: { card: 'border-[#fecaca]', badge: 'bg-[#fee2e2] text-[#991b1b]', title: 'text-error' },
  success: { card: 'border-[#a7f3d0]', badge: 'bg-[#d1fae5] text-[#065f46]', title: 'text-success' },
};

export function AuthStateCard({ context, state }: { context: AuthShowcaseContext; state: AuthShowcaseState }) {
  const content = stateContent[context][state];
  const style = stateStyles[state];
  return <article className={`m-0 min-h-[132px] overflow-hidden rounded-[14px] border bg-surface px-[19px] py-[17px] ${style.card}`} aria-label={`${context === 'login' ? 'Login' : 'Registro'} · ${content.badge}`}>
    <span className={`inline-flex min-h-[28px] items-center rounded-[14px] px-3 font-heading text-xs font-medium ${style.badge}`}>{content.badge}</span>
    <strong className={`mt-3 block font-heading text-[15px] font-semibold ${style.title}`}>{content.title}</strong>
    <p className="mt-[7px] text-xs text-muted">{content.description}</p>
  </article>;
}

function AuthShowcaseSection({ context }: { context: AuthShowcaseContext }) {
  const label = context === 'login' ? 'Login' : 'Registro';
  return <section className="mt-10 max-[900px]:mt-8" aria-labelledby={`showcase-${context}`}>
    <h2 className="font-heading text-[13px] font-semibold uppercase text-[#94c4fc]" id={`showcase-${context}`}>{label}</h2>
    <div className="mt-3 grid grid-cols-3 gap-[18px] max-[900px]:grid-cols-1">
      <AuthStateCard context={context} state="loading" />
      <AuthStateCard context={context} state="error" />
      <AuthStateCard context={context} state="success" />
    </div>
    <p className="mt-3 text-xs text-muted"><strong className="font-semibold">Vacío / inicial:</strong> formulario limpio con placeholders, sin mensajes de error y con el botón disponible.</p>
  </section>;
}

export function AuthStatesShowcasePage() {
  return <section className="mx-auto max-w-[1296px] [&_h1]:text-[22px] [&_h1]:leading-[1.25]">
    <PageTitle title="Estados del sistema · Autenticación" />
    <p className="mt-2 text-[15px] text-muted">Referencia visual de los estados de validación para iniciar sesión y crear una cuenta.</p>
    <AuthShowcaseSection context="login" />
    <AuthShowcaseSection context="register" />
  </section>;
}
