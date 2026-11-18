import { roomError } from './RoomCreation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Link, useParams } from 'react-router-dom';
import { firebaseAuth } from '../firebase';
import { api, ApiError, type Message, type Room } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { PageTitle } from '../components/PageTitle';
type RoomView = 'grid' | 'screen-share';
export type Participant = { id?: string; name: string; initials: string; microphone: 'on' | 'off'; camera: 'on' | 'off'; active?: boolean; sharing?: boolean };
type RoomMessage = { id: string; authorId: string; sender: string; initials: string; time: string; text: string };
function trimTrailingSlashes(value: string) { let end = value.length; while (end > 0 && value[end - 1] === '/') end -= 1; return value.slice(0, end); }
const realtimeUrl = trimTrailingSlashes(import.meta.env.VITE_REALTIME_URL ?? 'http://localhost:10001');
function initials(value: string) { return value.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'US'; }
function fromMessage(message: Message, currentUserId?: string): RoomMessage { const sender = message.authorId === currentUserId ? 'Tú' : `Usuario ${message.authorId.slice(0, 6)}`; return { id: message.id, authorId: message.authorId, sender, initials: initials(sender), time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: message.text }; }
export function PictureInPictureStrip({ participants }: { participants: Participant[] }) { const visible = participants.slice(0, 4); const remaining = Math.max(0, participants.length - 4); return <div className="shared-screen-participants" role="region" aria-label="Participantes de la presentación">{visible.map((participant, index) => <article className="shared-screen-thumbnail" key={`${participant.id ?? participant.name}-${index}`} aria-label={`Miniatura de ${participant.name}`}><div className={`room-sidebar-avatar room-sidebar-avatar-${index}`} aria-hidden="true">{participant.initials}</div><p>{participant.name}</p></article>)}{remaining > 0 && <div className="shared-screen-more" aria-label={`${remaining} participantes adicionales`}>+{remaining}</div>}</div>; }
export function RoomPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return <RoomView key={JSON.stringify([user?.id, id])} roomId={id ?? ''} />;
}

function RoomView({ roomId }: { roomId: string }) {
  const { user } = useAuth(); const [room, setRoom] = useState<Room | null>(null); const [participants, setParticipants] = useState<Participant[]>([]); const [messages, setMessages] = useState<RoomMessage[]>([]); const [draft, setDraft] = useState(''); const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'); const [notice, setNotice] = useState(''); const [retry, setRetry] = useState(0); const [canRetry, setCanRetry] = useState(false); const [realtime, setRealtime] = useState<'connecting' | 'joining' | 'joined' | 'reconnecting' | 'error'>('connecting'); const [mic, setMic] = useState(false); const [camera, setCamera] = useState(false); const [sharing, setSharing] = useState(false); const socketRef = useRef<Socket | null>(null); const currentUserId = user?.id;
  useEffect(() => {
    let active = true;
    let joined = false;
    let joining = false;
    let generation = 0;
    let acknowledged = false;
    let confirmedParticipants: string[] | undefined;
    let terminalMessage = '';
    let authorizationFailed = false;
    let detachReconnect: (() => void) | undefined;
    const authorizationCodes = new Set([
      'AUTH_REQUIRED', 'AUTH_INVALID', 'EMAIL_NOT_VERIFIED', 'PROFILE_INCOMPLETE',
      'PROFILE_INCONSISTENT', 'ACCOUNT_UNAVAILABLE', 'ACCOUNT_DELETION_PENDING',
      'ACCOUNT_DELETION_BLOCKED', 'ACCOUNT_DELETED', 'ROOM_NOT_FOUND', 'ROOM_ACCESS_DENIED',
    ]);
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    const identity = firebaseAuth.currentUser;
    const valid = () => active && firebaseAuth.currentUser === identity;

    function resetJoin() {
      clearTimeout(joinTimer);
      generation++;
      joining = false;
      joined = false;
      acknowledged = false;
      confirmedParticipants = undefined;
      setParticipants([]);
    }

    function failRealtime(message: string, denied = false) {
      resetJoin();
      authorizationFailed = authorizationFailed || denied;
      terminalMessage = message;
      setCanRetry(!authorizationFailed);
      setRealtime('error');
      setNotice(message);
    }

    setRealtime('connecting');
    setCanRetry(false);
    setNotice('');

    async function load() {
      try {
        const details = await api.getRoom(roomId);
        if (!valid()) return;
        setRoom(details);
        setStatus('ready');
      } catch (error) {
        if (!valid()) return;
        setStatus('error');
        setNotice(roomError(error, 'No pudimos cargar la sala.'));
        return;
      }

      void api.listMessages(roomId).then(history => {
        if (valid()) setMessages(current => [...history.map(message => fromMessage(message, currentUserId)),
          ...current.filter(message => !history.some(saved => saved.id === message.id))]);
      }).catch(() => {
        if (valid() && !terminalMessage) setNotice('No pudimos cargar el historial de mensajes.');
      });

      try {
        const token = await identity?.getIdToken();
        if (!valid()) return;
        if (!token) { failRealtime('Tu sesión expiró. Vuelve a iniciar sesión.', true); return; }
        const socket = io(realtimeUrl, { auth: { token }, reconnection: true, reconnectionAttempts: 3, autoConnect: false });
        socketRef.current = socket;
        function denyOrFail(code: string | undefined, fallback: string) {
          const denied = code !== undefined && authorizationCodes.has(code);
          failRealtime(denied ? 'Tu sesión no tiene autorización para el ingreso en tiempo real.' : fallback, denied);
          if (denied) socket.disconnect();
        }

        function confirmJoin() {
          if (!joining || !socket.connected || !acknowledged || !confirmedParticipants) return;
          clearTimeout(joinTimer);
          joining = false;
          joined = true;
          setRealtime('joined');
          setNotice('');
          setParticipants([]);
          for (const uid of confirmedParticipants) addParticipant(uid);
          socket.emit('media:state', { microphone: false, camera: false });
        }

        socket.on('connect', () => {
          if (!valid() || authorizationFailed || joining || joined) return;
          terminalMessage = '';
          joining = true;
          const attempt = ++generation;
          setCanRetry(false);
          setRealtime('joining');
          setNotice('');
          joinTimer = setTimeout(() => {
            if (valid() && joining && attempt === generation) {
              failRealtime('No pudimos confirmar el ingreso en tiempo real.');
            }
          }, 12000);
          socket.emit('room:join', { roomId }, (response: { ok?: boolean; error?: { code?: string } }) => {
            if (!valid() || !joining || attempt !== generation) return;
            if (response?.ok === false) {
              denyOrFail(response.error?.code, 'No pudimos ingresar a la sala en tiempo real.');
            } else if (response?.ok === true) {
              acknowledged = true;
              confirmJoin();
            }
          });
        });
        socket.on('room:joined', ({ roomId: joinedId, participants: ids = [] }: { roomId: string; participants?: string[] }) => {
          if (!valid() || !joining || !socket.connected || joinedId !== roomId) return;
          confirmedParticipants = ids;
          confirmJoin();
        });
        socket.on('disconnect', () => {
          if (!valid()) return;
          resetJoin();
          if (socket.active && !authorizationFailed) {
            setRealtime('reconnecting');
            setCanRetry(false);
          } else {
            failRealtime(terminalMessage || 'La conexión en tiempo real terminó.', authorizationFailed);
          }
        });
        socket.on('connect_error', (error: { data?: { code?: string } }) => {
          if (!valid()) return;
          if (authorizationCodes.has(error.data?.code ?? '')) {
            denyOrFail(error.data?.code, '');
          } else if (socket.active) {
            setRealtime('reconnecting');
            setCanRetry(false);
          } else {
            failRealtime('No pudimos conectar con el servicio en tiempo real.');
          }
        });
        const reconnectFailed = () => {
          if (valid() && !authorizationFailed) failRealtime('No pudimos restablecer la conexión en tiempo real.');
        };
        socket.io.on('reconnect_failed', reconnectFailed);
        detachReconnect = () => socket.io.off('reconnect_failed', reconnectFailed);
        socket.on('error:message', ({ code }: { code?: string } = {}) => {
          if (!valid()) return;
          if (authorizationCodes.has(code ?? '') || joining) {
            denyOrFail(code, 'No pudimos ingresar a la sala en tiempo real.');
          } else if (joined) {
            setNotice('No pudimos completar la operación en tiempo real.');
          }
        });
        socket.on('chat:message', (value: { authorId: string; text: string; createdAt: string }) => {
          if (!valid() || !joined || value.authorId === currentUserId) return;
          setMessages(current => [...current, { id: `live-${value.authorId}-${value.createdAt}`, authorId: value.authorId, sender: `Usuario ${value.authorId.slice(0, 6)}`, initials: 'US', time: new Date(value.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: value.text }]);
        });
        function addParticipant(participantId: string) {
          setParticipants(current => current.some(item => item.id === participantId) ? current :
            [...current, { id: participantId, name: participantId === currentUserId ? `${user?.name ?? 'Tú'} · Tú` : `Usuario ${participantId.slice(0, 6)}`, initials: participantId === currentUserId ? initials(user?.name ?? 'Tú') : 'US', microphone: 'off', camera: 'off', active: participantId === currentUserId }]);
        }
        socket.on('room:participant-joined', ({ userId }: { userId: string }) => { if (valid() && joined) addParticipant(userId); });
        socket.on('room:participant-left', ({ userId }: { userId: string }) => { if (valid() && joined) setParticipants(current => current.filter(item => item.id !== userId)); });
        socket.on('media:state', ({ fromUserId, payload }: { fromUserId?: string; payload?: { microphone?: boolean; camera?: boolean } }) => {
          if (valid() && joined) setParticipants(current => current.map(item => item.id === fromUserId ? { ...item, microphone: payload?.microphone ? 'on' : 'off', camera: payload?.camera ? 'on' : 'off' } : item));
        });
        socket.on('screen:state', ({ payload }: { payload?: { sharing?: boolean } }) => { if (valid() && joined) setSharing(Boolean(payload?.sharing)); });
        socket.connect();
      } catch {
        if (valid()) failRealtime('No pudimos conectar con el servicio en tiempo real.');
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(joinTimer);
      const socket = socketRef.current;
      if (socket) {
        if (joined) socket.emit('room:leave', { roomId });
        socket.removeAllListeners();
        detachReconnect?.();
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUserId, roomId, user?.name, retry]);
  const connected = realtime === 'joined';
  const realtimeLabel = { connecting: 'Conectando…', joining: 'Confirmando ingreso…', joined: 'Ingreso confirmado', reconnecting: 'Reconectando…', error: 'Realtime no disponible' }[realtime];
  async function sendMessage(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const text = draft.trim(); if (!connected || !text || text.length > 2000 || !socketRef.current) return; setDraft(''); try { const saved = await api.createMessage(roomId, { text }); setMessages(current => [...current, fromMessage(saved, currentUserId)]); socketRef.current.emit('chat:send', { text }); } catch (error) { setNotice(error instanceof ApiError ? error.message : 'No pudimos enviar el mensaje.'); setDraft(text); } }
  function emitMedia(nextMic = mic, nextCamera = camera) { socketRef.current?.emit('media:state', { microphone: nextMic, camera: nextCamera }); }
  if (status === 'loading') return <section className="room-loading-screen" role="status" aria-live="polite"><div className="room-loading-card"><div className="room-loading-mark" aria-hidden="true">S</div><p className="room-loading-eyebrow">TeamSpeak · Sala</p><h1>Preparando tu sala</h1><p className="room-loading-description">Estamos verificando el acceso a la sala.</p><div className="room-loading-progress" aria-hidden="true"><span /></div><p className="room-loading-status">Cargando sala…</p><Link className="button secondary room-loading-back" to="/dashboard">Volver a mis salas</Link></div></section>;
  if (status === 'error' || !room) return <section className="page-panel" role="alert"><PageTitle title="No pudimos abrir la sala" /><p>{notice}</p><Link className="button secondary" to="/dashboard">Volver a mis salas</Link></section>;
  return <section className="room-shell"><header className="room-header"><div className="room-header-brand"><span aria-hidden="true">S</span><div><h1>{room.name}</h1><p>{room.ownerId === currentUserId ? 'Anfitrión' : 'Miembro'} · ID {room.id}</p></div></div><div className="room-header-status"><span className="room-live-badge" role="status">{realtimeLabel}</span>{connected && <span>{participants.length} participantes</span>}</div><div className="room-header-actions"><Link className="media-control media-control-exit" to="/dashboard"><img src="/assets/figma/exit.svg" alt="" /><span>Salir</span></Link></div>{realtime === 'error' && notice && <p role="status" className="room-connection-notice">{notice}</p>}</header><div className="room-content"><div className="video-stage" role="region" aria-labelledby="participants-title"><div className="video-stage-heading"><h2 id="participants-title">Participantes</h2>{sharing && <p>Estás compartiendo el estado de tu pantalla</p>}</div><div className="participant-grid">{participants.map((participant, index) => <article className={`participant-card participant-card-${index}`} key={participant.id}><div className="participant-avatar" aria-hidden="true">{participant.initials}</div><p className="participant-name">{participant.name}</p><div className="participant-status"><img src={`/assets/figma/mic-${participant.microphone}.svg`} alt={participant.microphone === 'on' ? 'Micrófono activo' : 'Micrófono apagado'} /><img src={`/assets/figma/camera-${participant.camera}.svg`} alt={participant.camera === 'on' ? 'Cámara activa' : 'Cámara apagada'} /></div></article>)}</div><div className="media-controls" aria-label="Controles multimedia"><button className="media-control" type="button" disabled={!connected} aria-pressed={mic} onClick={() => { const next = !mic; setMic(next); emitMedia(next, camera); }}><img src={mic ? '/assets/figma/mic-on-control.svg' : '/assets/figma/mic-off-control.svg'} alt="" /><span>{mic ? 'Micrófono activo' : 'Micrófono silenciado'}</span></button><button className="media-control" type="button" disabled={!connected} aria-pressed={camera} onClick={() => { const next = !camera; setCamera(next); emitMedia(mic, next); }}><img src={camera ? '/assets/figma/camera-on-control.svg' : '/assets/figma/camera-off-control.svg'} alt="" /><span>{camera ? 'Cámara activa' : 'Cámara apagada'}</span></button><button className="media-control" type="button" disabled={!connected} aria-pressed={sharing} onClick={() => { const next = !sharing; setSharing(next); socketRef.current?.emit('screen:state', { sharing: next }); }}><img src="/assets/figma/share.svg" alt="" /><span>{sharing ? 'Dejar de compartir' : 'Compartir pantalla'}</span></button></div></div><aside className="room-side-panel" id="room-side-panel" aria-label="Chat de sala"><div className="room-side-panel-heading"><h2>Chat de la sala</h2><span>{connected ? 'Conectado' : 'Sin conexión'}</span></div><p className="room-chat-description">Los mensajes son visibles para quienes están en esta sala.</p><div className="room-chat-messages" aria-live="polite">{messages.map(message => <article className="room-chat-message" key={message.id}><div className="room-chat-avatar" aria-hidden="true">{message.initials}</div><div className="room-chat-message-body"><div className="room-chat-message-meta"><strong>{message.sender}</strong><time>{message.time}</time></div><p>{message.text}</p></div></article>)}</div><form className="room-chat-form" onSubmit={sendMessage}><label className="visually-hidden" htmlFor="room-chat-input">Mensaje para la sala</label><input id="room-chat-input" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje para la sala…" /><button type="submit" aria-label="Enviar mensaje" disabled={!connected || !draft.trim()}>↑</button></form>{realtime !== 'error' && notice && <p role="status" className="auth-state">{notice}</p>}{realtime === 'error' && canRetry && <button className="button secondary" type="button" onClick={() => setRetry(value => value + 1)}>Reintentar conexión</button>}</aside></div></section>;
}
