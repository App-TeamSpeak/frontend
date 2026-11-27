import { Link } from 'react-router-dom';
export function Footer() {
  return <footer className="site-footer border-t border-border text-sm text-muted">
    <div className="mx-auto flex max-w-[1296px] flex-wrap justify-between gap-6 px-6 py-5">
      <p>TeamSpeak · Estudia mejor, en compañía.</p>
      <nav className="flex flex-wrap gap-6" aria-label="Enlaces de apoyo">
        <Link className="inline-flex min-h-[44px] items-center" to="/accesibilidad">Accesibilidad</Link>
        <Link className="inline-flex min-h-[44px] items-center" to="/ayuda">Ayuda</Link>
      </nav>
    </div>
  </footer>;
}
