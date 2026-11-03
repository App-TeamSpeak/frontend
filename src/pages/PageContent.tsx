import type { ReactNode } from 'react';
import { PageTitle } from '../components/PageTitle';
export function PageContent({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-10">{eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">{eyebrow}</p>}<PageTitle title={title} /><div className="mt-6">{children}</div></section>; }
