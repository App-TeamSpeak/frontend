import type { ReactNode } from 'react';
import { PageTitle } from '../components/PageTitle';
export function PageContent({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return <section className="page-panel mx-auto max-w-[1136px] rounded-[24px] border border-border bg-surface p-8">
    {eyebrow && <p className="mb-3 font-heading text-[13px] font-semibold uppercase tracking-[0.16em] text-link">{eyebrow}</p>}
    <PageTitle title={title} />
    <div className="mt-6">{children}</div>
  </section>;
}
