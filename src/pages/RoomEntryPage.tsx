import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageContent } from './PageContent';
import { api, ApiError } from '../services/api';
import { useNavigate } from 'react-router-dom';
export function RoomEntryPage({ create = false }: { create?: boolean }) {
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const value = String(data.get(create ? 'name' : 'id') ?? '').trim(); try { const room = create ? await api.createRoom({ name: value }) : await api.joinRoom(value); navigate(`/salas/${encodeURIComponent(room.id)}`); } catch (error) { setNotice(error instanceof ApiError ? error.message : 'No pudimos completar la operación.'); } }
  return <PageContent title={create ? 'Crear sala' : 'Unirse a sala'}><form className="entry-form" onSubmit={submit}><div className="form-field"><label htmlFor="room-entry">{create ? 'Nombre de la sala' : 'ID de la sala'}</label><input id="room-entry" name={create ? 'name' : 'id'} placeholder={create ? 'Grupo de estudio' : 'ID de la sala'} required /></div>{create && <div className="form-field"><label htmlFor="privacy">Privacidad</label><select id="privacy" name="privacy"><option value="private">Privada</option><option value="public">Pública</option></select></div>}<button type="submit" className="button primary">{create ? 'Crear sala' : 'Unirse a sala'}</button><Link className="button secondary" to="/dashboard">Cancelar</Link><p role="status">{notice}</p></form></PageContent>;
}
