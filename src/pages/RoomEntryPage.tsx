import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageContent } from './PageContent';
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
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('id') ?? '').trim();
    try {
      const room = await api.joinRoom(value);
      navigate(`/salas/${encodeURIComponent(room.id)}`);
    } catch (error) { setNotice(error instanceof ApiError ? error.message : 'No pudimos completar la operación.'); }
  }
  return <PageContent title="Unirse a sala"><form className="entry-form" onSubmit={submit}>
    <div className="form-field"><label htmlFor="room-entry">ID de la sala</label><input id="room-entry" name="id" placeholder="ID de la sala" required /></div>
    <button type="submit" className="button primary">Unirse a sala</button>
    <Link className="button secondary" to="/dashboard">Cancelar</Link><p role="status">{notice}</p>
  </form></PageContent>;
}
