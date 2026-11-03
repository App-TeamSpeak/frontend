import { useCallback, useEffect, useState } from 'react';

type Sprint0Response = {
  success: true;
  data: Record<string, unknown>;
};

type ApiErrorResponse = {
  success: false;
  code?: string;
  message?: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:10000';

function formatValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export default function App() {
  const [document, setDocument] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiErrorResponse | null>(null);

  const loadSprint0 = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/sprint0/demo`, { signal });
      const body = await response.json() as Sprint0Response | ApiErrorResponse;

      if (!response.ok || body.success === false) {
        setDocument(null);
        setError(body.success === false
          ? body
          : { success: false, code: 'API_ERROR', message: 'La API devolvió una respuesta no válida.' });
        return;
      }

      setDocument(body.data);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setDocument(null);
      setError({ success: false, code: 'NETWORK_ERROR', message: 'No se pudo conectar con la API.' });
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSprint0(controller.signal);
    return () => controller.abort();
  }, [loadSprint0]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          TeamSpeak
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Salón de estudio colaborativo</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          Verificación de la conexión entre React, la API REST y Firestore.
        </p>

        <div className="mt-10 border-t border-slate-800 pt-8" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Sprint 0</p>
              <h2 className="mt-2 text-2xl font-semibold">Documento de verificación</h2>
              <p className="mt-2 text-sm text-slate-400">sprint_prueba / verificacion_sprint0</p>
            </div>
            <button
              className="rounded-lg border border-cyan-400/50 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              onClick={() => void loadSprint0()}
              type="button"
            >
              {isLoading ? 'Consultando…' : 'Actualizar'}
            </button>
          </div>

          {isLoading && (
            <p className="mt-8 rounded-xl border border-slate-700 bg-slate-950/60 p-5 text-slate-300">
              Consultando los datos reales de Firestore…
            </p>
          )}

          {!isLoading && error && (
            <div className="mt-8 rounded-xl border border-rose-400/40 bg-rose-950/30 p-5" role="alert">
              <p className="font-semibold text-rose-200">No se pudo cargar la evidencia</p>
              <p className="mt-2 text-sm text-rose-100/80">{error.message ?? 'La API devolvió un error.'}</p>
              {error.code && <p className="mt-2 font-mono text-xs text-rose-200/70">Código: {error.code}</p>}
            </div>
          )}

          {!isLoading && document && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {Object.entries(document).map(([key, value]) => (
                <article className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-5" key={key}>
                  <p className="font-mono text-xs uppercase tracking-wider text-emerald-300/80">{key}</p>
                  <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-base text-slate-100">{formatValue(value)}</pre>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
