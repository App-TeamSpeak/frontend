import type { ReactNode } from 'react';
import { PageTitle } from '../components/PageTitle';
export function PageContent({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) { return <section className="page-panel">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<PageTitle title={title} /><div className="page-body">{children}</div></section>; }
