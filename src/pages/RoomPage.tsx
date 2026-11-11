import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

type RoomView = 'grid' | 'screen-share';
type ScreenShareOwner = 'self' | 'other' | null;
export type Participant = { name: string; initials: string; microphone: 'on' | 'off'; camera: 'on' | 'off'; active?: boolean; sharing?: boolean };
type RoomMessage = { sender: string; initials: string; time: string; text: string };

const participants: Participant[] = [
  { name: 'Ana Martínez', initials: 'AM', microphone: 'on', camera: 'on', active: true },
  { name: 'Luis Herrera', initials: 'LH', microphone: 'off', camera: 'on' },
  { name: 'Mateo Gómez', initials: 'MG', microphone: 'on', camera: 'off' },
  { name: 'Laura Díaz', initials: 'LD', microphone: 'on', camera: 'on', sharing: true },
];

const initialMessages: RoomMessage[] = [
  { sender: 'Ana Martínez', initials: 'AM', time: '14:02', text: '¿Revisamos el ejercicio 3?' },
  { sender: 'Luis Herrera', initials: 'LH', time: '14:03', text: 'Sí, comparto mis apuntes en un momento.' },
  { sender: 'Laura Díaz', initials: 'LD', time: '14:04', text: 'La fórmula del límite está en la página 12.' },
];

type MediaControlsProps = {
  shareMode: 'available' | 'self-sharing' | 'unavailable';
  isMicrophoneOn: boolean;
  isCameraOn: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onShare?: () => void;
  onStopSharing?: () => void;
};

function MediaControls({ shareMode, isMicrophoneOn, isCameraOn, onToggleMicrophone, onToggleCamera, onShare, onStopSharing }: MediaControlsProps) {
  const isSelfSharing = shareMode === 'self-sharing';
  const isUnavailable = shareMode === 'unavailable';

  return <div className="media-controls" aria-label="Controles multimedia">
    <button className={`media-control media-control-av${isMicrophoneOn ? '' : ' media-control-av-off'}`} type="button" aria-label={isMicrophoneOn ? 'Silenciar tu micrófono' : 'Activar tu micrófono'} aria-pressed={isMicrophoneOn} onClick={onToggleMicrophone}><img src={isMicrophoneOn ? '/assets/figma/mic-on-control.svg' : '/assets/figma/mic-off-control.svg'} alt="" /><span>{isMicrophoneOn ? 'Micrófono activo' : 'Micrófono silenciado'}</span></button>
    <button className={`media-control media-control-av${isCameraOn ? '' : ' media-control-av-off'}`} type="button" aria-label={isCameraOn ? 'Apagar tu cámara' : 'Activar tu cámara'} aria-pressed={isCameraOn} onClick={onToggleCamera}><img src={isCameraOn ? '/assets/figma/camera-on-control.svg' : '/assets/figma/camera-off-control.svg'} alt="" /><span>{isCameraOn ? 'Cámara activa' : 'Cámara apagada'}</span></button>
    {isUnavailable ? <button className="media-control media-control-disabled" type="button" disabled aria-label="Compartir" aria-describedby="share-disabled-description"><img src="/assets/figma/share.svg" alt="" /><span>Compartir<small id="share-disabled-description">No disponible</small></span></button> : <button className={`media-control${isSelfSharing ? ' media-control-sharing' : ''}`} type="button" aria-label={isSelfSharing ? 'Dejar de compartir' : 'Compartir pantalla'} aria-pressed={isSelfSharing} onClick={isSelfSharing ? onStopSharing : onShare}><img src="/assets/figma/share.svg" alt="" /><span>{isSelfSharing ? 'Dejar de compartir' : 'Compartir pantalla'}</span></button>}
    <Link className="media-control media-control-exit" to="/dashboard"><img src="/assets/figma/exit.svg" alt="" /><span>Salir</span></Link>
  </div>;
}

function ParticipantThumbnail({ participant, index }: { participant: Participant; index: number }) {
  return <article className={`shared-screen-thumbnail${participant.sharing ? ' shared-screen-presenting' : ''}`} aria-label={`Miniatura de ${participant.name}`}>
    {participant.sharing && <span className="shared-screen-presenting-badge">Presentando</span>}
    <div className={`room-sidebar-avatar room-sidebar-avatar-${index}`} aria-hidden="true">{participant.initials}</div>
    <p>{participant.name}{participant.active ? ' · Tú' : ''}</p>
    <div className="participant-status" aria-label={`${participant.name}: micrófono ${participant.microphone === 'on' ? 'activo' : 'apagado'}, cámara ${participant.camera === 'on' ? 'activa' : 'apagada'}`}>
      <img src={`/assets/figma/mic-${participant.microphone}.svg`} alt="" />
      <img src={`/assets/figma/camera-${participant.camera}.svg`} alt="" />
    </div>
  </article>;
}

export function PictureInPictureStrip({ participants }: { participants: Participant[] }) {
  const maxVisibleParticipants = 4;
  const visibleParticipants = participants.slice(0, maxVisibleParticipants);
  const remainingParticipants = Math.max(0, participants.length - maxVisibleParticipants);

  return <div className="shared-screen-participants" role="region" aria-label="Participantes de la presentación">
    {visibleParticipants.map((participant, index) => <ParticipantThumbnail key={participant.name} participant={participant} index={index} />)}
    {remainingParticipants > 0 && <div className="shared-screen-more" aria-label={`${remainingParticipants} participantes adicionales`}>+{remainingParticipants}</div>}
  </div>;
}

type SharedScreenStageProps = {
  participants: Participant[];
  presenter: Exclude<ScreenShareOwner, null>;
  isMicrophoneOn: boolean;
  isCameraOn: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onExit: () => void;
};

function SharedScreenStage({ participants, presenter, isMicrophoneOn, isCameraOn, onToggleMicrophone, onToggleCamera, onExit }: SharedScreenStageProps) {
  const isSelfSharing = presenter === 'self';
  const presenterName = isSelfSharing ? 'Estás compartiendo' : 'Laura Díaz está compartiendo su pantalla';
  const mediaStatus = isMicrophoneOn && isCameraOn ? 'Tú · Micrófono activo · Cámara activa' : `Tú · ${isMicrophoneOn ? 'Micrófono activo' : 'Micrófono silenciado'} · ${isCameraOn ? 'Cámara activa' : 'Cámara apagada'}`;

  return <section className="video-stage room-screen-share-stage" aria-labelledby="shared-screen-title">
    <div className="shared-screen-header">
      <h2 id="shared-screen-title">{presenterName}</h2>
      <div className={`shared-screen-header-actions${isMicrophoneOn && isCameraOn ? '' : ' shared-screen-header-actions-off'}`}><p>{mediaStatus}</p><button className="shared-screen-return" type="button" onClick={onExit}>Volver a la cuadrícula</button></div>
    </div>
    <div className="shared-screen-layout">
      <div className="shared-screen-canvas" aria-label="Contenido compartido de la clase">
        <h3>Cálculo diferencial</h3>
        <p>Ejercicio 3 · Aplicación de límites</p>
        <div className="shared-screen-equation" aria-label="Ecuación del ejercicio">
          <strong>lim&nbsp; f(x) = (x² − 4) / (x − 2)</strong>
          <span>x → 2</span>
        </div>
      </div>
      <PictureInPictureStrip participants={participants} />
    </div>
    <MediaControls shareMode={isSelfSharing ? 'self-sharing' : 'unavailable'} isMicrophoneOn={isMicrophoneOn} isCameraOn={isCameraOn} onToggleMicrophone={onToggleMicrophone} onToggleCamera={onToggleCamera} onStopSharing={onExit} />
  </section>;
}

export function RoomPage() {
  const { id } = useParams();
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(true);
  const [roomView, setRoomView] = useState<RoomView>('grid');
  const [screenShareOwner, setScreenShareOwner] = useState<ScreenShareOwner>(null);
  const [isMicrophoneOn, setIsMicrophoneOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const roomId = id ?? 'desconocida';
  const roomName = roomId === 'CALC-8F2K' ? 'Cálculo II · Grupo A' : `Sala ${roomId}`;
  const toggleCollaboration = () => setIsCollaborationOpen(open => !open);
  const changeRoomView = (nextView: RoomView, nextOwner: ScreenShareOwner = null) => {
    setRoomView(nextView);
    setScreenShareOwner(nextOwner);
    setIsMoreMenuOpen(false);
    if (nextView === 'screen-share') setIsCollaborationOpen(false);
  };
  const startOwnShare = () => changeRoomView('screen-share', 'self');
  const stopOwnShare = () => changeRoomView('grid');
  const currentParticipants: Participant[] = participants.map(participant => participant.active ? { ...participant, microphone: isMicrophoneOn ? 'on' : 'off', camera: isCameraOn ? 'on' : 'off' } : participant);
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setIsMoreMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreMenuOpen]);
  const handleMessageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages(current => [...current, { sender: 'Ana Martínez', initials: 'AM', time: 'Ahora', text }]);
    setDraft('');
  };

  return <section className="room-shell">
    <header className={`room-header${roomView === 'screen-share' ? ' room-header-screen-share' : ''}`}>
      <div className="room-header-brand"><span aria-hidden="true">T</span><div><h1>{roomName}</h1><p>Sala privada · ID {roomId}</p></div></div>
      <div className="room-header-status"><span className={roomView === 'screen-share' ? 'room-share-badge' : 'room-live-badge'}>{roomView === 'screen-share' ? (screenShareOwner === 'self' ? 'Estás compartiendo' : 'Pantalla compartida') : 'EN VIVO'}</span>{roomView === 'grid' && <span>4 participantes</span>}</div>
      <div className="room-header-actions">
        <div className="room-panel-toggles" aria-label="Paneles de sala">
          <button className="room-panel-toggle" type="button" aria-expanded={isCollaborationOpen} aria-controls="room-side-panel" onClick={toggleCollaboration}>♙ Participantes</button>
          <button className="room-panel-toggle" type="button" aria-expanded={isCollaborationOpen} aria-controls="room-side-panel" onClick={toggleCollaboration}>▤ Chat</button>
        </div>
        <div className="room-more-menu-wrap" ref={moreMenuRef}>
          <button className="room-more-button" ref={moreButtonRef} type="button" aria-label="Más opciones de la sala" aria-haspopup="menu" aria-expanded={isMoreMenuOpen} aria-controls="room-view-menu" onClick={() => setIsMoreMenuOpen(open => !open)}>···</button>
          {isMoreMenuOpen && <div className="room-view-menu" id="room-view-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => changeRoomView(roomView === 'grid' ? 'screen-share' : 'grid', roomView === 'grid' ? 'other' : null)}>{roomView === 'grid' ? 'Ver pantalla compartida' : 'Volver a la cuadrícula'}</button>
          </div>}
        </div>
      </div>
    </header>
    <div className={`room-content${roomView === 'screen-share' ? ' room-content-screen-share' : ''}${roomView === 'screen-share' && isCollaborationOpen ? ' room-content-screen-share-panel-open' : ''}`}>
      {roomView === 'screen-share' ? <SharedScreenStage participants={currentParticipants.map(participant => ({ ...participant, sharing: screenShareOwner === 'self' ? participant.active : participant.name === 'Laura Díaz' }))} presenter={screenShareOwner ?? 'other'} isMicrophoneOn={isMicrophoneOn} isCameraOn={isCameraOn} onToggleMicrophone={() => setIsMicrophoneOn(on => !on)} onToggleCamera={() => setIsCameraOn(on => !on)} onExit={stopOwnShare} /> : <div className="video-stage" role="region" aria-labelledby="participants-title">
        <div className="video-stage-heading"><h2 id="participants-title">Participantes</h2>{participants.find(participant => participant.sharing) && <p>Laura Díaz está compartiendo su pantalla</p>}</div>
        <div className="participant-grid">
          {currentParticipants.map((participant, index) => <article className={`participant-card participant-card-${index}${participant.active ? ' participant-card-active' : ''}`} key={participant.name} aria-label={`Participante ${participant.name}`}>
            <div className="participant-avatar" aria-hidden="true">{participant.initials}</div>
            <p className="participant-name">{participant.name}</p>
            <div className="participant-status" aria-label={`${participant.name}: micrófono ${participant.microphone === 'on' ? 'activo' : 'apagado'}, cámara ${participant.camera === 'on' ? 'activa' : 'apagada'}`}>
              <img src={`/assets/figma/mic-${participant.microphone}.svg`} alt="" />
              <img src={`/assets/figma/camera-${participant.camera}.svg`} alt="" />
            </div>
          </article>)}
        </div>
        <MediaControls shareMode="available" isMicrophoneOn={isMicrophoneOn} isCameraOn={isCameraOn} onToggleMicrophone={() => setIsMicrophoneOn(on => !on)} onToggleCamera={() => setIsCameraOn(on => !on)} onShare={startOwnShare} />
      </div>}
      {isCollaborationOpen && <aside className="room-side-panel" id="room-side-panel" aria-label="Colaboración de sala">
        <div className="room-side-panel-heading">
          <h2>En la sala (4)</h2>
          <button className="room-side-panel-close" onClick={() => setIsCollaborationOpen(false)} type="button" aria-label="Cerrar panel">×</button>
        </div>
        <div className="room-sidebar-participants">
          {currentParticipants.map((participant, index) => <div className="room-sidebar-participant" key={participant.name}>
            <div className={`room-sidebar-avatar room-sidebar-avatar-${index}`} aria-hidden="true">{participant.initials}</div>
            <span>{participant.name}</span>
            <div className="participant-status" aria-label={`${participant.name}: micrófono ${participant.microphone === 'on' ? 'activo' : 'apagado'}, cámara ${participant.camera === 'on' ? 'activa' : 'apagada'}`}>
              <img src={`/assets/figma/mic-${participant.microphone}.svg`} alt="" />
              <img src={`/assets/figma/camera-${participant.camera}.svg`} alt="" />
            </div>
          </div>)}
        </div>
        <section className="room-chat-section" aria-labelledby="room-chat-title">
          <h2 id="room-chat-title">Chat de la sala</h2>
          <p className="room-chat-description">Los mensajes son visibles para quienes están en esta sala.</p>
          <div className="room-chat-messages" aria-live="polite">
            {messages.map((message, index) => <article className="room-chat-message" key={`${message.sender}-${message.time}-${index}`}>
              <div className={`room-chat-avatar room-sidebar-avatar-${participants.findIndex(participant => participant.initials === message.initials)}`} aria-hidden="true">{message.initials}</div>
              <div className="room-chat-message-body">
                <div className="room-chat-message-meta"><strong>{message.sender}</strong><time>{message.time}</time></div>
                <p>{message.text}</p>
              </div>
            </article>)}
          </div>
          <form className="room-chat-form" onSubmit={handleMessageSubmit}>
            <label className="visually-hidden" htmlFor="room-chat-input">Mensaje para la sala</label>
            <span className="visually-hidden" id="room-chat-input-description">Escribe un mensaje y presiona Enviar mensaje para agregarlo al chat local.</span>
            <input id="room-chat-input" type="text" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje para la sala…" aria-describedby="room-chat-input-description" />
            <button type="submit" aria-label="Enviar mensaje">↑</button>
          </form>
        </section>
      </aside>}
    </div>
    <p className="room-footer-note">El panel de participantes y chat se abre desde los controles superiores y conserva el mismo diseño en cámara y pantalla compartida.</p>
  </section>;
}
