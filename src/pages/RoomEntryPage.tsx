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
    <section className={`room-management-dialog room-management-dialog-join room-join-page${invalid ? ' room-management-dialog-join-error' : ''}`}>
      <PageTitle title="Unirse a sala" />
      <p className="room-management-dialog-description">Ingresa únicamente el ID de la sala que te compartieron.</p>
      <JoinRoomForm
        inputId="room-entry"
        errorId="room-entry-error"
        onInvalidChange={setInvalid}
        onBusyChange={setBusy}
        cancelAction={
          <Link
            className="button secondary"
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
