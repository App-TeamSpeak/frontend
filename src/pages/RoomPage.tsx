import { roomError } from '../utils/roomError';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type UIEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Link, useParams } from 'react-router-dom';
import { firebaseAuth } from '../firebase';
import { api, type Message, type Room } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { PageTitle } from '../components/PageTitle';
import { appendLiveMessage, formatMessageAuthor, mergeHistoryPage, messageAvatarTone, normalizeHistoryResult } from '../utils/chatHistory';
import { formatNewMessagesLabel, isNearBottom } from '../utils/chatScroll';
type RoomView = 'grid' | 'screen-share';
type PendingScrollAction =
  | { type: 'preserve-prepend'; scrollHeight: number; scrollTop: number }
  | { type: 'to-bottom' }
  | null;
export type Participant = { id?: string; name: string; initials: string; microphone: 'on' | 'off'; camera: 'on' | 'off'; active?: boolean; sharing?: boolean };
type RoomMessage = { id: string; authorId: string; sender: string; initials: string; avatarTone: 0 | 1 | 2 | 3; time: string; createdAt: string; text: string };
function trimTrailingSlashes(value: string) { let end = value.length; while (end > 0 && value[end - 1] === '/') end -= 1; return value.slice(0, end); }
const realtimeUrl = trimTrailingSlashes(import.meta.env.VITE_REALTIME_URL ?? 'http://localhost:10001');
function initials(value: string) { return value.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'US'; }
function fromMessage(message: Message, currentUserId?: string): RoomMessage {
  const { sender, initials: authorInitials } = formatMessageAuthor(message, currentUserId);
  return { id: message.id, authorId: message.authorId ?? '', sender, initials: authorInitials, avatarTone: messageAvatarTone(message, currentUserId), time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), createdAt: message.createdAt, text: message.text };
}
export function PictureInPictureStrip({ participants }: { participants: Participant[] }) { const visible = participants.slice(0, 4); const remaining = Math.max(0, participants.length - 4); return <div className="shared-screen-participants" role="region" aria-label="Participantes de la presentación">{visible.map((participant, index) => <article className="shared-screen-thumbnail" key={`${participant.id ?? participant.name}-${index}`} aria-label={`Miniatura de ${participant.name}`}><div className={`room-sidebar-avatar room-sidebar-avatar-${index}`} aria-hidden="true">{participant.initials}</div><p>{participant.name}</p></article>)}{remaining > 0 && <div className="shared-screen-more" aria-label={`${remaining} participantes adicionales`}>+{remaining}</div>}</div>; }
export function RoomPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return <RoomView key={JSON.stringify([user?.id, id])} roomId={id ?? ''} />;
}

function RoomView({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyError, setHistoryError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sendingCount, setSendingCount] = useState(0);
  const [chatError, setChatError] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const [realtime, setRealtime] = useState<'connecting' | 'joining' | 'joined' | 'reconnecting' | 'error'>('connecting');
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const olderPendingRef = useRef(false);
  const initialHistoryStartedRef = useRef(false);
  const historyAbortRef = useRef<AbortController | null>(null);
  const historyGenRef = useRef(0);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<'messages' | 'older' | null>(null);
  const pendingScrollActionRef = useRef<PendingScrollAction>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const userScrolledUpRef = useRef(false);
  const ownSendPendingCountRef = useRef(0);
  const sendingCountRef = useRef(0);
  const sendSeqRef = useRef(0);
  const failedSendIdRef = useRef<number | null>(null);
  const inFlightSendsRef = useRef<Map<number, string>>(new Map());
  const chatErrorCooldownRef = useRef(false);
  const prevFooterKeyRef = useRef('');
  const mountedRef = useRef(true);
  const currentUserId = user?.id;

  const loadInitialHistory = useCallback((fromRetry = false) => {
    if (fromRetry && document.activeElement === retryRef.current) {
      messagesListRef.current?.focus();
    }
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    const gen = ++historyGenRef.current;
    const identity = firebaseAuth.currentUser;
    setHistoryStatus('loading');
    setHistoryError('');
    void api.listMessages(roomId, { signal: controller.signal }).then(raw => {
      if (!mountedRef.current || gen !== historyGenRef.current || firebaseAuth.currentUser !== identity) return;
      const page = normalizeHistoryResult(raw);
      const mapped = page.messages.map(message => fromMessage(message, currentUserId));
      for (const item of mapped) seenMessageIdsRef.current.add(item.id);
      const container = messagesListRef.current;
      const snapshot = container ? { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop } : null;
      if (userScrolledUpRef.current && snapshot && snapshot.scrollHeight > 0) {
        pendingScrollActionRef.current = { type: 'preserve-prepend', ...snapshot };
      } else if (mapped.length > 0 && !userScrolledUpRef.current) {
        pendingScrollActionRef.current = { type: 'to-bottom' };
      }
      setMessages(current => mergeHistoryPage(current, mapped, 'initial'));
      setNextCursor(page.nextCursor);
      setHistoryStatus('ready');
    }).catch(() => {
      if (controller.signal.aborted || !mountedRef.current || gen !== historyGenRef.current || firebaseAuth.currentUser !== identity) return;
      setHistoryStatus('error');
      setHistoryError('No pudimos cargar el historial de mensajes.');
    });
  }, [currentUserId, roomId]);

  async function loadOlderMessages(fromRetry = false) {
    if (olderPendingRef.current || !nextCursor) return;
    const hadLoadMoreFocus = document.activeElement === loadMoreRef.current;
    if (fromRetry && document.activeElement === retryRef.current) {
      messagesListRef.current?.focus();
    } else if (hadLoadMoreFocus) {
      messagesListRef.current?.focus();
    }
    const controller = new AbortController();
    historyAbortRef.current = controller;
    const gen = historyGenRef.current;
    const identity = firebaseAuth.currentUser;
    const cursor = nextCursor;
    olderPendingRef.current = true;
    setLoadingOlder(true);
    setHistoryError('');
    try {
      const raw = await api.listMessages(roomId, { cursor, signal: controller.signal });
      if (!mountedRef.current || gen !== historyGenRef.current || firebaseAuth.currentUser !== identity) return;
      const page = normalizeHistoryResult(raw);
      const mapped = page.messages.map(message => fromMessage(message, currentUserId));
      for (const item of mapped) seenMessageIdsRef.current.add(item.id);
      const container = messagesListRef.current;
      const snapshot = container ? { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop } : null;
      if (hadLoadMoreFocus) {
        restoreFocusRef.current = page.nextCursor ? 'older' : 'messages';
      }
      if (snapshot && pendingScrollActionRef.current?.type !== 'to-bottom') {
        pendingScrollActionRef.current = { type: 'preserve-prepend', ...snapshot };
      }
      setMessages(current => mergeHistoryPage(current, mapped, 'older'));
      setNextCursor(page.nextCursor);
    } catch {
      if (controller.signal.aborted || !mountedRef.current || gen !== historyGenRef.current || firebaseAuth.currentUser !== identity) return;
      if (hadLoadMoreFocus) restoreFocusRef.current = 'messages';
      setHistoryError('No pudimos cargar los mensajes anteriores.');
    } finally {
      olderPendingRef.current = false;
      if (mountedRef.current && gen === historyGenRef.current && firebaseAuth.currentUser === identity) {
        setLoadingOlder(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      historyGenRef.current++;
      historyAbortRef.current?.abort();
    };
  }, []);

  useLayoutEffect(() => {
    const action = pendingScrollActionRef.current;
    const container = messagesListRef.current;
    const footerKey = `${chatError}|${notice}|${realtime}`;
    const footerChanged = prevFooterKeyRef.current !== '' && prevFooterKeyRef.current !== footerKey;
    prevFooterKeyRef.current = footerKey;
    if (action && container) {
      pendingScrollActionRef.current = null;
      if (action.type === 'preserve-prepend') {
        container.scrollTop = Math.max(0, action.scrollTop + (container.scrollHeight - action.scrollHeight));
      } else {
        container.scrollTop = container.scrollHeight;
      }
    } else if (footerChanged && !userScrolledUpRef.current && !olderPendingRef.current && container) {
      container.scrollTop = container.scrollHeight;
    }
    if (restoreFocusRef.current) {
      const target = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (target === 'older' && loadMoreRef.current && !loadMoreRef.current.disabled) {
        loadMoreRef.current.focus({ preventScroll: true });
      } else {
        (retryRef.current ?? container)?.focus({ preventScroll: true });
      }
    }
  }, [messages, nextCursor, loadingOlder, historyError, chatError, notice, realtime]);

  function handleMessagesScroll(event: UIEvent<HTMLDivElement>) {
    const atBottom = isNearBottom(event.currentTarget);
    userScrolledUpRef.current = !atBottom;
    if (atBottom) setUnreadCount(0);
  }

  function jumpToLatest() {
    const container = messagesListRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    pendingScrollActionRef.current = null;
    userScrolledUpRef.current = false;
    setUnreadCount(0);
    container?.focus();
  }
  useEffect(() => {
    let active = true;
    let joined = false;
    let joining = false;
    let generation = 0;
    let acknowledged = false;
    let confirmedParticipants: string[] | undefined;
    let confirmedParticipantNames: Record<string, string | null> = {};
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
      confirmedParticipantNames = {};
      setParticipants([]);
      setMic(false);
      setCamera(false);
      setSharing(false);
      sendingCountRef.current = 0;
      setSendingCount(0);
      ownSendPendingCountRef.current = 0;
      if (inFlightSendsRef.current.size > 0) {
        const unsent = Array.from(inFlightSendsRef.current.values()).join('\n');
        inFlightSendsRef.current.clear();
        setDraft(current => current || unsent);
        setChatError('No pudimos enviar el mensaje por pérdida de conexión.');
      }
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

      if (!initialHistoryStartedRef.current) {
        initialHistoryStartedRef.current = true;
        loadInitialHistory();
      }

      try {
        const token = await identity?.getIdToken();
        if (!valid()) return;
        if (!token) { failRealtime('Tu sesión expiró. Vuelve a iniciar sesión.', true); return; }
        const socket = io(realtimeUrl, { auth: { token }, reconnection: true, reconnectionAttempts: 3, autoConnect: false });
        socketRef.current = socket;
        function denyOrFail(code: string | undefined, fallback: string) {
          const denied = code !== undefined && authorizationCodes.has(code);
          const message = code === 'ROOM_NOT_FOUND' ? 'La sala no existe.'
            : code === 'ROOM_ACCESS_DENIED' ? 'No tienes acceso a esta sala.'
              : code === 'AUTHORIZATION_UNAVAILABLE' ? 'No pudimos verificar el acceso a la sala. Inténtalo de nuevo.'
                : denied ? 'Tu sesión no tiene autorización para el ingreso en tiempo real.' : fallback;
          failRealtime(message, denied);
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
          for (const uid of confirmedParticipants) addParticipant(uid, confirmedParticipantNames[uid]);
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
        socket.on('room:joined', ({ roomId: joinedId, participants: ids = [], participantNames = {} }: { roomId: string; participants?: string[]; participantNames?: Record<string, string | null> }) => {
          if (!valid() || !joining || !socket.connected || joinedId !== roomId) return;
          confirmedParticipants = ids;
          confirmedParticipantNames = participantNames;
          confirmJoin();
        });
        socket.on('room:access-revoked', (event: { roomId?: string; code?: string } | undefined) => {
          if (!valid() || event?.roomId !== roomId || (!joined && !joining)) return;
          if (event.code !== 'ROOM_NOT_FOUND' && event.code !== 'ROOM_ACCESS_DENIED') return;
          setMic(false);
          setCamera(false);
          setSharing(false);
          denyOrFail(event.code, '');
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
            denyOrFail(error.data?.code, 'No pudimos conectar con el servicio en tiempo real.');
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
            const isChatScopedError = code === 'MESSAGE_INVALID' || code === 'AUTHORIZATION_BUSY' || code === 'EVENT_FAILED' || code === 'AUTHORIZATION_UNAVAILABLE';
            if (isChatScopedError && (sendingCountRef.current > 0 || chatErrorCooldownRef.current)) {
              chatErrorCooldownRef.current = false;
              return;
            }
            setNotice('No pudimos completar la operación en tiempo real.');
          }
        });
        socket.on('chat:message', (value: Omit<Message, 'id' | 'roomId'> & { messageId?: string; roomId?: string }) => {
          if (!valid() || !joined || !value.messageId) return;
          if (value.roomId && value.roomId !== roomId) return;
          if (seenMessageIdsRef.current.has(value.messageId)) return;
          seenMessageIdsRef.current.add(value.messageId);
          const container = messagesListRef.current;
          const actuallyNearBottom = !container || isNearBottom(container);
          const atBottom = !userScrolledUpRef.current;
          const forceBottomForOwnSend = ownSendPendingCountRef.current > 0 && value.authorId === currentUserId;
          if (forceBottomForOwnSend) {
            ownSendPendingCountRef.current = Math.max(0, ownSendPendingCountRef.current - 1);
          }
          const shouldScroll = forceBottomForOwnSend || (atBottom && (!olderPendingRef.current || actuallyNearBottom));
          if (shouldScroll) {
            pendingScrollActionRef.current = { type: 'to-bottom' };
            userScrolledUpRef.current = false;
            setUnreadCount(0);
          } else {
            setUnreadCount(count => count + 1);
          }
          const message = fromMessage({ ...value, id: value.messageId, roomId }, currentUserId);
          setMessages(current => appendLiveMessage(current, message));
        });
        function addParticipant(participantId: string, authorName?: string | null) {
          const isSelf = participantId === currentUserId;
          const resolvedName = typeof authorName === 'string' ? authorName.trim() : '';
          const name = isSelf
            ? `${user?.name ?? 'Tú'} · Tú`
            : resolvedName || `Usuario ${participantId.slice(0, 6)}`;
          const participantInitials = isSelf
            ? initials(user?.name ?? 'Tú')
            : resolvedName ? initials(resolvedName) : 'US';
          setParticipants(current => current.some(item => item.id === participantId) ? current :
            [...current, { id: participantId, name, initials: participantInitials, microphone: 'off', camera: 'off', active: isSelf }]);
        }
        socket.on('room:participant-joined', ({ userId, authorName }: { userId: string; authorName?: string | null }) => { if (valid() && joined) addParticipant(userId, authorName); });
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
  }, [currentUserId, loadInitialHistory, roomId, user?.name, retry]);
  const connected = realtime === 'joined';
  const realtimeLabel = { connecting: 'Conectando…', joining: 'Confirmando ingreso…', joined: 'Ingreso confirmado', reconnecting: 'Reconectando…', error: 'Realtime no disponible' }[realtime];
  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    const socket = socketRef.current;
    const identity = firebaseAuth.currentUser;
    if (!connected || !socket?.connected || !text || text.length > 2000) return;
    const connectionId = socket.id;
    const sendId = ++sendSeqRef.current;
    failedSendIdRef.current = null;
    chatErrorCooldownRef.current = false;
    setChatError('');
    setDraft('');
    inFlightSendsRef.current.set(sendId, text);
    ownSendPendingCountRef.current += 1;
    sendingCountRef.current += 1;
    setSendingCount(sendingCountRef.current);
    socket.volatile.timeout(12_000).emit('chat:send', { text }, (error: Error | null, ack?: { ok: boolean }) => {
      if (socketRef.current !== socket || firebaseAuth.currentUser !== identity ||
        !socket.connected || socket.id !== connectionId) return;
      inFlightSendsRef.current.delete(sendId);
      sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
      setSendingCount(sendingCountRef.current);
      if (error) {
        ownSendPendingCountRef.current = Math.max(0, ownSendPendingCountRef.current - 1);
        failedSendIdRef.current = sendId;
        chatErrorCooldownRef.current = true;
        setChatError('No pudimos confirmar el envío. Revisa el historial antes de volver a enviarlo.');
      } else if (!ack?.ok) {
        ownSendPendingCountRef.current = Math.max(0, ownSendPendingCountRef.current - 1);
        failedSendIdRef.current = sendId;
        setChatError('No pudimos enviar el mensaje.');
        setDraft(current => current || text);
      } else if (failedSendIdRef.current === null) {
        setChatError('');
      }
    });
  }
  function emitMedia(nextMic = mic, nextCamera = camera) { socketRef.current?.emit('media:state', { microphone: nextMic, camera: nextCamera }); }
  const chatStatus = sendingCount > 0
    ? { text: 'Enviando mensaje…', className: 'room-chat-description room-chat-status-warning', role: 'status' as const }
    : realtime === 'reconnecting'
      ? { text: 'Restableciendo conexión con la sala…', className: 'room-chat-description room-chat-status-warning', role: 'status' as const }
      : realtime === 'error'
        ? { text: 'Sin conexión. No es posible enviar mensajes.', className: 'room-chat-description room-chat-status-error' }
        : { text: 'Los mensajes son visibles para quienes están en esta sala.', className: 'room-chat-description' };
  if (status === 'loading') return <section className="room-loading-screen" role="status" aria-live="polite"><div className="room-loading-card"><div className="room-loading-mark" aria-hidden="true">S</div><p className="room-loading-eyebrow">TeamSpeak · Sala</p><h1>Preparando tu sala</h1><p className="room-loading-description">Estamos verificando el acceso a la sala.</p><div className="room-loading-progress" aria-hidden="true"><span /></div><p className="room-loading-status">Cargando sala…</p><Link className="button secondary room-loading-back" to="/dashboard">Volver a mis salas</Link></div></section>;
  if (status === 'error' || !room) return <section className="page-panel" role="alert"><PageTitle title="No pudimos abrir la sala" /><p>{notice}</p><Link className="button secondary" to="/dashboard">Volver a mis salas</Link></section>;
  return <section className="room-shell"><header className="room-header"><div className="room-header-brand"><span aria-hidden="true">S</span><div><h1>{room.name}</h1><p>{room.ownerId === currentUserId ? 'Anfitrión' : 'Miembro'} · ID {room.id}</p></div></div><div className="room-header-status"><span className={`room-live-badge room-live-badge-${realtime}`} role="status">{realtimeLabel}</span>{connected && <span>{participants.length} participantes</span>}</div><div className="room-header-actions"><Link className="media-control media-control-exit" to="/dashboard"><img src="/assets/figma/exit.svg" alt="" /><span>Salir</span></Link></div>{realtime === 'error' && notice && <p role="status" className="room-connection-notice">{notice}</p>}</header><div className="room-content"><div className="video-stage" role="region" aria-labelledby="participants-title"><div className="video-stage-heading"><h2 id="participants-title">Participantes</h2>{sharing && <p className="room-share-badge">Estás compartiendo el estado de tu pantalla</p>}</div><div className="participant-grid">{participants.map((participant, index) => <article className={`participant-card participant-card-${index % 4}${participant.active ? ' participant-card-active' : ''}`} key={participant.id}><div className="participant-avatar" aria-hidden="true">{participant.initials}</div><p className="participant-name">{participant.name}</p><div className="participant-status"><img src={`/assets/figma/mic-${participant.microphone}.svg`} alt={participant.microphone === 'on' ? 'Micrófono activo' : 'Micrófono apagado'} /><img src={`/assets/figma/camera-${participant.camera}.svg`} alt={participant.camera === 'on' ? 'Cámara activa' : 'Cámara apagada'} /></div></article>)}</div><div className="media-controls" aria-label="Controles multimedia"><button className={`media-control${connected && !mic ? ' media-control-av-off' : ''}`} type="button" disabled={!connected} aria-pressed={mic} onClick={() => { const next = !mic; setMic(next); emitMedia(next, camera); }}><img src={mic ? '/assets/figma/mic-on-control.svg' : '/assets/figma/mic-off-control.svg'} alt="" /><span>{mic ? 'Micrófono activo' : 'Micrófono silenciado'}</span></button><button className={`media-control${connected && !camera ? ' media-control-av-off' : ''}`} type="button" disabled={!connected} aria-pressed={camera} onClick={() => { const next = !camera; setCamera(next); emitMedia(mic, next); }}><img src={camera ? '/assets/figma/camera-on-control.svg' : '/assets/figma/camera-off-control.svg'} alt="" /><span>{camera ? 'Cámara activa' : 'Cámara apagada'}</span></button><button className={`media-control${connected && sharing ? ' media-control-sharing' : ''}`} type="button" disabled={!connected} aria-pressed={sharing} onClick={() => { const next = !sharing; setSharing(next); socketRef.current?.emit('screen:state', { sharing: next }); }}><img src="/assets/figma/share.svg" alt="" /><span>{sharing ? 'Dejar de compartir' : 'Compartir pantalla'}</span></button></div></div><aside className="room-side-panel" id="room-side-panel" aria-label="Chat de sala"><div className="room-side-panel-heading"><h2>Chat de la sala</h2><span>{connected ? 'Conectado' : 'Sin conexión'}</span></div><p className={chatStatus.className} role={chatStatus.role}>{chatStatus.text}</p>{unreadCount > 0 && <button type="button" className="room-chat-new-messages" onClick={jumpToLatest}>{formatNewMessagesLabel(unreadCount)}</button>}<div className="room-chat-messages" ref={messagesListRef} role="region" aria-label="Historial de mensajes" tabIndex={0} aria-live="polite" onScroll={handleMessagesScroll}>{nextCursor && historyStatus === 'ready' && !historyError && <button ref={loadMoreRef} className="button secondary room-chat-load-more" type="button" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? 'Cargando mensajes anteriores…' : 'Ver más antiguos'}</button>}{historyStatus === 'loading' && <div className="room-chat-history-status" role="status"><span className="skeleton-block skeleton-shimmer room-chat-skeleton" aria-hidden="true" /><span className="skeleton-block skeleton-shimmer room-chat-skeleton room-chat-skeleton-short" aria-hidden="true" /><p>Cargando mensajes anteriores…</p></div>}{historyError && <div className="room-chat-history-error" role="alert"><p>{historyError}</p><button ref={retryRef} className="button secondary" type="button" disabled={loadingOlder} onClick={() => historyStatus === 'error' ? loadInitialHistory(true) : void loadOlderMessages(true)}>Reintentar</button></div>}{historyStatus === 'ready' && !historyError && messages.length === 0 && <p className="room-chat-empty">Sin mensajes anteriores. Esta sala aún no tiene conversación.</p>}{messages.map(message => <article className="room-chat-message" key={message.id}><div className={`room-chat-avatar room-sidebar-avatar-${message.avatarTone}`} aria-hidden="true">{message.initials}</div><div className="room-chat-message-body"><div className="room-chat-message-meta"><strong>{message.sender}</strong><time>{message.time}</time></div><p>{message.text}</p></div></article>)}</div><form className="room-chat-form" onSubmit={sendMessage}><label className="visually-hidden" htmlFor="room-chat-input">Mensaje para la sala</label><input id="room-chat-input" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje para la sala…" /><button type="submit" aria-label="Enviar mensaje" disabled={!connected || !draft.trim()}>↑</button></form>{chatError && <p role="alert" className="auth-state">{chatError}</p>}{realtime !== 'error' && notice && <p role="status" className="auth-state">{notice}</p>}{realtime === 'error' && canRetry && <button className="button secondary" type="button" onClick={() => setRetry(value => value + 1)}>Reintentar conexión</button>}</aside></div></section>;
}
