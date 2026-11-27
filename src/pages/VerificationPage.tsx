import { useCallback, useEffect, useRef, useState } from 'react';
import { PageContent } from './PageContent';
import { fetchSprint0Demo, type Sprint0ApiError, type Sprint0Document } from '../services/api';

type State = { status: 'loading' } | { status: 'error'; error: Sprint0ApiError } | { status: 'success'; document: Sprint0Document };
function formatValue(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
export function VerificationPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const activeRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ status: 'loading' });
    try {
      const document = await fetchSprint0Demo(controller.signal);
      if (!controller.signal.aborted) setState({ status: 'success', document });
    } catch (error) {
      if (controller.signal.aborted) return;
      const apiError: Sprint0ApiError = typeof error === 'object' && error !== null && 'success' in error && error.success === false && 'message' in error
        ? error as Sprint0ApiError
        : { success: false, code: 'NETWORK_ERROR', message: 'No se pudo conectar con la API. Comprueba tu conexión y reintenta.' };
      setState({ status: 'error', error: apiError });
    }
  }, []);
  useEffect(() => { void load(); return () => activeRequest.current?.abort(); }, [load]);
  return <PageContent eyebrow="Sprint 0 · Base técnica" title="Documento de verificación">
    <p className="text-muted">Consulta el documento que la API obtiene de Firestore. Puedes actualizarlo para consultar sus cambios.</p>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted">Verificación de conexión</p><button className="button secondary" disabled={state.status === 'loading'} onClick={() => void load()} type="button">{state.status === 'loading' ? 'Consultando…' : 'Actualizar'}</button></div>
    <div className="mt-6" aria-live="polite" aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && <div className="mt-4 rounded-[10px] border border-link p-4 text-link-strong" role="status"><p>Consultando los datos reales de Firestore…</p><p>El servidor puede tardar hasta un minuto en responder al iniciar.</p></div>}
      {state.status === 'error' && <div className="rounded-xl border border-error bg-danger-deep p-6 text-error" role="alert"><h2>No se pudo cargar el documento</h2><p className="mt-3 mb-5">{state.error.message}</p><button className="button secondary" onClick={() => void load()} type="button">Reintentar</button></div>}
      {state.status === 'success' && <div><p className="font-semibold text-success" role="status">Éxito · Documento recibido de la API.</p>{Object.keys(state.document).length === 0 && <p>El documento existe, pero todavía no contiene campos.</p>}<dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">{Object.entries(state.document).map(([key, value]) => <div className="min-w-0 rounded-xl border border-border bg-avatar-green p-6" key={key}><dt className="mb-3 font-semibold text-success break-words">{key}</dt><dd><pre className="font-[inherit] whitespace-pre-wrap break-words">{formatValue(value)}</pre></dd></div>)}</dl></div>}
    </div>
  </PageContent>;
}
