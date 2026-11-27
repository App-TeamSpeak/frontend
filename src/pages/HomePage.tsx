import { Link } from 'react-router-dom';
import { PageContent } from './PageContent';
export function HomePage() {
  return <PageContent eyebrow="Salón de estudio colaborativo" title="Aprende y colabora en TeamSpeak">
    <p className="max-w-2xl text-lg leading-8 text-muted">Un espacio para organizar tus sesiones de estudio y compartir avances con tu equipo. Esta entrega contiene la estructura de navegación del Sprint 0.</p>
    <div className="mt-8 flex flex-wrap gap-3">
      <Link className="rounded-lg bg-primary px-5 py-3 font-heading font-semibold text-text transition-colors duration-[120ms] hover:bg-primary-hover motion-reduce:transition-none" to="/registro">Crear cuenta</Link>
      <Link className="rounded-lg border border-link/60 px-5 py-3 font-heading font-semibold text-link-strong transition-colors duration-[120ms] hover:bg-primary/10 motion-reduce:transition-none" to="/login">Iniciar sesión</Link>
    </div>
    <div className="mt-10 rounded-xl border border-border bg-canvas/60 p-5">
      <h2 className="font-heading text-2xl font-semibold text-text">Verificación técnica</h2>
      <p className="mt-2 text-muted">Consulta el dato real que viaja desde Firestore hasta la API y React.</p>
      <Link className="mt-4 inline-block font-semibold text-link underline underline-offset-4" to="/verificacion">Ver datos de Firestore</Link>
    </div>
  </PageContent>;
}
