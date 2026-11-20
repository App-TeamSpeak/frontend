import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { api, ApiError } from '../services/api';
import { useOptionalAuth } from '../auth/AuthContext';
import { RoomCreation } from './RoomCreation';
export function RoomEntryPage({ create = false }: { create?: boolean }) {
  const navigate = useNavigate();
  const uid = useOptionalAuth()?.user?.id;
  return create ? <RoomCreation protectNavigation key={uid ?? ''} onClose={() => navigate('/dashboard')} /> : <JoinRoomPage />;
}

function JoinRoomPage() {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const value = String(new FormData(event.currentTarget).get('id') ?? '').trim();
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      const room = await api.joinRoom(value);
      navigate(`/salas/${encodeURIComponent(room.id)}`);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'No pudimos completar la operación.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <section className="room-management-dialog room-management-dialog-join room-join-page">
    <PageTitle title="Unirse a sala" />
    <p className="room-management-dialog-description">Ingresa únicamente el ID de la sala que te compartieron.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <div className="form-field">
        <label htmlFor="room-entry">ID de la sala</label>
        <input id="room-entry" name="id" placeholder="ID de la sala" required disabled={busy} onChange={() => setNotice('')} />
      </div>
      {(busy || notice) && <div className="room-management-status" role="status" data-error={Boolean(notice)}>
        <strong>{busy ? 'Uniéndote a la sala…' : 'No pudimos unirte'}</strong>
        <p>{busy ? 'Comprobando el ID de la sala.' : notice}</p>
      </div>}
      <div className="room-management-dialog-actions">
        <Link className="button secondary" to="/dashboard">Cancelar</Link>
        <button type="submit" className="button primary" disabled={busy}>Unirse a sala</button>
      </div>
    </form>
  </section>;
}
