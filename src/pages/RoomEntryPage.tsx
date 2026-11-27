import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthContext';
import { JoinRoomForm } from '../components/JoinRoomForm';
import { PageTitle } from '../components/PageTitle';
import { RoomCreation } from './RoomCreation';

export function RoomEntryPage({ create = false }: { create?: boolean }) {
  const navigate = useNavigate();
  const uid = useOptionalAuth()?.user?.id;
  return create ? <RoomCreation protectNavigation key={uid ?? ''} onClose={() => navigate('/dashboard')} /> : <JoinRoomPage />;
}

function JoinRoomPage() {
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  return (
    <section className={`room-join-page mx-auto w-[min(500px,100%)] min-h-[370px] rounded-[20px] border border-border bg-surface px-8 pt-7 pb-5 shadow-[0_24px_64px_var(--dialog-shadow)] [overflow-wrap:anywhere] max-md:min-h-0 max-md:rounded-[19px] max-md:px-[23px] max-md:pt-[26px] max-md:pb-6 [&_h1]:text-[26px] [&_h1]:leading-8${invalid ? ' room-management-dialog-join-error' : ''}`}>
      <PageTitle title="Unirse a sala" />
      <p className="mt-3 text-[15px] text-muted">Ingresa únicamente el ID de la sala que te compartieron.</p>
      <JoinRoomForm
        inputId="room-entry"
        errorId="room-entry-error"
        onInvalidChange={setInvalid}
        onBusyChange={setBusy}
        cancelAction={
          <Link
            className="inline-flex h-12 min-h-[48px] w-[130px] items-center justify-center gap-3 rounded-[10px] border border-border-strong bg-surface px-4 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-link-strong cursor-pointer transition-[background-color,border-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none hover:bg-subtle active:translate-y-px motion-reduce:active:translate-y-0 aria-disabled:cursor-default aria-disabled:opacity-60 max-md:h-auto max-md:min-h-[46px] max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:rounded-[9px] max-md:px-2 max-md:text-center max-md:whitespace-normal"
            to="/dashboard"
            aria-disabled={busy || undefined}
            onClick={event => {
              if (busy) event.preventDefault();
            }}
          >
            Cancelar
          </Link>
        }
        onJoined={room => navigate(`/salas/${encodeURIComponent(room.id)}`)}
      />
    </section>
  );
}
