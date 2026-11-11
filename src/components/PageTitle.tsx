import { useEffect } from 'react';
export function PageTitle({ title }: { title: string }) { useEffect(() => { document.title = 'TeamSpeak'; }, [title]); return <h1 className="text-4xl font-bold tracking-tight text-slate-100">{title}</h1>; }
