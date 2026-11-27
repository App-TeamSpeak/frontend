import { useEffect } from 'react';
export function PageTitle({ title }: { title: string }) { useEffect(() => { document.title = 'TeamSpeak'; }, [title]); return <h1 className="font-heading text-[32px] font-semibold leading-[1.25] tracking-tight text-text">{title}</h1>; }
