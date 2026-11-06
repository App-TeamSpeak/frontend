import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageContent } from './PageContent';
export function RoomEntryPage({ create = false }: { create?: boolean }) {
  const [notice, setNotice] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setNotice('Esta acción estará disponible al habilitar la autenticación en un próximo sprint. No se ha creado ni abierto ninguna sala.'); }
  return <PageContent title={create ? 'Crear sala' : 'Unirse a sala'}><form className="entry-form" onSubmit={submit}><div className="form-field"><label htmlFor="room-entry">{create ? 'Nombre de la sala' : 'ID de la sala'}</label><input id="room-entry" name={create ? 'name' : 'id'} placeholder={create ? 'Grupo de estudio' : 'ID de la sala'} required /></div>{create && <div className="form-field"><label htmlFor="privacy">Privacidad</label><select id="privacy" name="privacy"><option value="private">Privada</option><option value="public">Pública</option></select></div>}<button type="submit" className="button primary">{create ? 'Crear sala' : 'Unirse a sala'}</button><Link className="button secondary" to="/dashboard">Cancelar</Link><p role="status">{notice}</p></form></PageContent>;
}
