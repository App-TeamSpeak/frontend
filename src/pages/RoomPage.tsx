import { roomError } from '../utils/roomError';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type UIEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { firebaseAuth } from '../firebase';
import { api, type Message, type Room } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { PageTitle } from '../components/PageTitle';
import { RoomManagementDialog } from '../components/RoomManagementDialog';
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
const chatAvatarTones: Record<0 | 1 | 2 | 3, string> = {
  0: 'bg-[#263b5b] text-[#93b4ff]',
  1: 'bg-[#123b35] text-text',
  2: 'bg-[#342b55] text-text',
  3: 'bg-[#4b293c] text-text',
};
export function PictureInPictureStrip({ participants }: { participants: Participant[] }) {
  const visible = participants.slice(0, 4);
  const remaining = Math.max(0, participants.length - 4);
  return <div className="flex w-full min-w-0 shrink-0 items-stretch gap-3 overflow-x-auto rounded-2xl border border-[#64748b] bg-[#0b1120] p-3 [scrollbar-color:#64748b_#0b1120]" role="region" aria-label="Participantes de la presentación">{visible.map((participant, index) => <article className={`relative flex w-[min(218px,calc((100%-36px)/4))] min-w-[202px] min-h-[123px] items-center justify-center overflow-hidden rounded-xl border border-[#64748b] max-md:w-[202px] ${index === 0 ? 'bg-[#1e293b]' : index === 2 ? 'bg-[#1d2d42]' : 'bg-[#1c2b3f]'}`} key={`${participant.id ?? participant.name}-${index}`} aria-label={`Miniatura de ${participant.name}`}><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-['Inter_Variable',sans-serif] text-lg font-semibold ${chatAvatarTones[(index % 4) as 0 | 1 | 2 | 3]}`} aria-hidden="true">{participant.initials}</div><p className="absolute bottom-[7px] left-[7px] font-['Inter_Variable',sans-serif] text-[11px] leading-[1.2] font-semibold text-text">{participant.name}</p></article>)}{remaining > 0 && <div className="grid w-[202px] min-w-[202px] min-h-[123px] shrink-0 place-items-center rounded-xl border border-dashed border-[#64748b] bg-surface font-['Inter_Variable',sans-serif] text-[22px] leading-none font-semibold text-[#cbd5e1]" aria-label={`${remaining} participantes adicionales`}>+{remaining}</div>}</div>;
}
export function RoomPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return <RoomView key={JSON.stringify([user?.id, id])} roomId={id ?? ''} />;
}

function RoomView({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [chatAnnouncement, setChatAnnouncement] = useState('');
  const [participantAnnouncement, setParticipantAnnouncement] = useState('');
  const [managementDialog, setManagementDialog] = useState<'edit' | 'delete' | null>(null);
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
        socket.on('room:updated', (event: { roomId?: string; name?: string } | undefined) => {
          if (!valid() || event?.roomId !== roomId || typeof event.name !== 'string') return;
          setRoom(current => current ? { ...current, name: event.name! } : current);
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
          if (value.authorId !== currentUserId) setChatAnnouncement(`Nuevo mensaje de ${message.sender}, ${message.time}: ${message.text}`);
        });
        function addParticipant(participantId: string, authorName?: string | null, announce = false) {
          const isSelf = participantId === currentUserId;
          const resolvedName = typeof authorName === 'string' ? authorName.trim() : '';
          const name = isSelf
            ? `${user?.name ?? 'Tú'} · Tú`
            : resolvedName || `Usuario ${participantId.slice(0, 6)}`;
          const participantInitials = isSelf
            ? initials(user?.name ?? 'Tú')
            : resolvedName ? initials(resolvedName) : 'US';
          setParticipants(current => {
            if (current.some(item => item.id === participantId)) return current;
            const next = [...current, { id: participantId, name, initials: participantInitials, microphone: 'off' as const, camera: 'off' as const, active: isSelf }];
            if (announce && !isSelf) setParticipantAnnouncement(`${name} se unió a la sala. ${next.length} participantes.`);
            return next;
          });
        }
        socket.on('room:participant-joined', ({ userId, authorName }: { userId: string; authorName?: string | null }) => { if (valid() && joined) addParticipant(userId, authorName, true); });
        socket.on('room:participant-left', ({ userId }: { userId: string }) => {
          if (!valid() || !joined) return;
          setParticipants(current => {
            const participant = current.find(item => item.id === userId);
            const next = current.filter(item => item.id !== userId);
            if (participant) setParticipantAnnouncement(`${participant.name} salió de la sala. ${next.length} participantes.`);
            return next;
          });
        });
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
  async function saveRoomName(name: string) {
    if (!room) return;
    const updated = await api.updateRoom(room.id, { name });
    setRoom(updated);
    setManagementDialog(null);
  }
  async function deleteCurrentRoom() {
    if (!room) return;
    await api.deleteRoom(room.id);
    navigate('/dashboard', { replace: true });
  }
  const chatStatus = sendingCount > 0
    ? { text: 'Enviando mensaje…', className: 'mt-2 text-xs text-warning', role: 'status' as const }
    : realtime === 'reconnecting'
      ? { text: 'Restableciendo conexión con la sala…', className: 'mt-2 text-xs text-warning', role: 'status' as const }
      : realtime === 'error'
        ? { text: 'Sin conexión. No es posible enviar mensajes.', className: 'mt-2 text-xs text-error' }
        : { text: 'Los mensajes son visibles para quienes están en esta sala.', className: 'mt-2 text-xs text-muted' };
  const screenCenter = 'grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_50%_20%,rgb(30_41_59_/_35%),transparent_42%),var(--canvas)] px-6 py-8';
  const screenCard = 'w-[min(440px,100%)] rounded-[20px] border border-border bg-surface px-9 pt-9 pb-8 text-center shadow-[0_20px_50px_rgb(2_6_23_/_24%)]';
  const backButtonClass = "mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-[10px] border border-border-strong bg-surface px-5 py-3 font-['Inter_Variable',sans-serif] text-sm font-semibold text-link-strong hover:bg-subtle";
  if (status === 'loading') return <section className={screenCenter} role="status" aria-live="polite"><div className={screenCard}><div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-[14px] bg-primary font-['Inter_Variable',sans-serif] text-[22px] leading-none font-semibold text-text" aria-hidden="true">S</div><p className="font-['Inter_Variable',sans-serif] text-[11px] leading-[1.2] font-semibold tracking-[0.14em] text-link uppercase">TeamSpeak · Sala</p><h1 className="mt-3 text-[26px] leading-[1.2]">Preparando tu sala</h1><p className="mx-auto mt-2.5 max-w-[320px] text-[15px] leading-[22px] text-muted">Estamos verificando el acceso a la sala.</p><div className="relative mt-7 h-1.5 w-full overflow-hidden rounded-full bg-subtle" aria-hidden="true"><span className="block h-full w-[38%] animate-[room-loading-progress_1.4s_ease-in-out_infinite] rounded-[inherit] bg-link motion-reduce:w-full motion-reduce:animate-none" /></div><p className="mt-3 text-[13px] text-muted">Cargando sala…</p><Link className={backButtonClass} to="/dashboard">Volver a mis salas</Link></div></section>;
  if (status === 'error' || !room) return <section className={screenCenter} role="alert"><div className={`${screenCard} [&_h1]:text-[26px] [&_h1]:leading-[1.2] [&_p]:mx-auto [&_p]:mt-3 [&_p]:max-w-[340px] [&_p]:text-[15px] [&_p]:leading-[22px] [&_p]:text-muted`}><PageTitle title="No pudimos abrir la sala" /><p>{notice}</p><Link className={backButtonClass} to="/dashboard">Volver a mis salas</Link></div></section>;
  const liveBadgeTone = realtime === 'error'
    ? 'border border-[rgb(252_165_165_/_35%)] bg-danger-surface text-error'
    : realtime === 'connecting' || realtime === 'joining' || realtime === 'reconnecting'
      ? 'bg-avatar-blue text-link'
      : 'bg-secondary text-success';
  const ownerBtnBase = "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-[10px] border bg-subtle px-[14px] font-['Inter_Variable',sans-serif] text-xs leading-none font-semibold transition-[border-color,background-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:border-link-strong [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border active:translate-y-px active:border-focus-ring active:bg-canvas motion-reduce:active:translate-y-0 focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-gap)]";
  const participantCardTones = ['bg-[#1e293b]', 'bg-[#1c2b3f]', 'bg-[#1d2d42]', 'bg-[#203447]'];
  const mediaControlBase = "flex h-[52px] min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-xl border px-3 font-['Inter_Variable',sans-serif] text-xs leading-none font-semibold transition-[border-color,background-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none min-[768px]:max-[1100px]:h-12 max-md:flex-[1_1_calc(50%-4px)] max-md:w-auto max-md:min-w-0 max-md:gap-1.5 max-md:px-2 max-md:text-[11px] [&_img]:h-5 [&_img]:w-5 [&_img]:shrink-0 [&_span]:flex [&_span]:flex-col [&_span]:gap-0.5 [&_span]:whitespace-nowrap active:not-disabled:translate-y-px motion-reduce:active:not-disabled:translate-y-0 focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-gap)] disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted disabled:opacity-100";
  const mediaDefaultTone = 'border-[#94a3b8] bg-[#263449] text-text [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:border-link-strong [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:bg-border active:not-disabled:border-focus-ring active:not-disabled:bg-canvas';
  const mediaAlertTone = 'border-error bg-danger-surface [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:border-error [@media(hover:hover)_and_(pointer:fine)]:hover:not-disabled:bg-danger-hover active:not-disabled:border-error active:not-disabled:bg-danger-deep';
  const chatSecondaryBtn = 'inline-flex min-h-9 items-center justify-center justify-self-start rounded-[10px] border border-border-strong bg-surface px-[14px] py-1.5 text-[13px] font-semibold text-link-strong hover:bg-subtle';
  const chatAlertBanner = 'mt-3 rounded-[10px] border border-[#995360] bg-[#3a202b] px-[14px] py-2.5 text-[13px] text-error';
  return <section className="min-h-dvh text-text max-md:overflow-x-hidden"><header className={`room-header flex min-h-[72px] items-center gap-6 bg-surface pr-[34px] pl-7 max-[1100px]:flex-wrap max-[1100px]:px-6 max-[1100px]:py-[14px] max-md:gap-3 max-md:px-4 max-md:py-[14px] ${realtime === 'error' && notice ? 'flex-wrap gap-y-2' : ''}`}><div className="flex min-w-0 items-center gap-[18px] max-md:flex-[1_1_100%]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary font-['Inter_Variable',sans-serif] text-lg leading-none font-semibold text-text" aria-hidden="true">S</span><div><h1 className="overflow-hidden font-['Inter_Variable',sans-serif] text-[17px] leading-[1.1] font-semibold text-ellipsis whitespace-nowrap text-text max-md:text-base">{room.name}</h1><p className="mt-1 text-xs whitespace-nowrap text-muted">{room.ownerId === currentUserId ? 'Anfitrión' : 'Miembro'} · ID {room.id}</p></div></div><div className="ml-auto mr-[51px] flex items-center gap-5 text-[13px] whitespace-nowrap text-muted max-[1100px]:order-3 max-[1100px]:mr-0 max-[1100px]:ml-[50px] max-[1100px]:w-full max-md:order-none max-md:mr-0 max-md:ml-0 max-md:w-auto"><span className={`inline-flex min-h-6 min-w-[130px] items-center justify-center rounded-xl px-3 font-['Inter_Variable',sans-serif] text-[11px] leading-none font-medium whitespace-nowrap ${liveBadgeTone}`} role="status">{realtimeLabel}</span>{connected && <span>{participants.length} participantes</span>}</div><div className="flex items-center gap-3 max-[1100px]:ml-auto max-md:ml-0 max-md:flex-[1_1_100%] max-md:flex-wrap max-md:justify-start">{room.ownerId === currentUserId && <><button className={`${ownerBtnBase} border-border text-text`} type="button" onClick={() => setManagementDialog('edit')}>Editar sala</button><button className={`${ownerBtnBase} border-error text-error`} type="button" onClick={() => setManagementDialog('delete')}>Eliminar sala</button></>}<Link className="flex h-9 min-h-9 w-20 flex-none items-center justify-center gap-2 rounded-[10px] border border-error bg-danger-surface px-2.5 font-['Inter_Variable',sans-serif] text-xs leading-none font-semibold text-text no-underline transition-[border-color,background-color,color,transform] duration-[120ms] ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:border-error [@media(hover:hover)_and_(pointer:fine)]:hover:bg-danger-hover active:translate-y-px active:border-error active:bg-danger-deep motion-reduce:active:translate-y-0 focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-gap)] [&_img]:h-5 [&_img]:w-5 [&_img]:shrink-0 [&_span]:whitespace-nowrap" to="/dashboard"><img src="/assets/figma/exit.svg" alt="" /><span>Salir</span></Link></div>{realtime === 'error' && notice && <p role="status" className="order-4 m-0 flex-[1_0_100%] pb-3 text-[13px] text-error">{notice}</p>}</header>{managementDialog && <RoomManagementDialog dialog={{ kind: managementDialog, room }} onClose={() => setManagementDialog(null)} onSave={saveRoomName} onDelete={deleteCurrentRoom} errorFallback={managementDialog === 'edit' ? 'No pudimos actualizar el nombre de la sala.' : 'No pudimos eliminar la sala.'} />}<div className="room-content flex items-stretch gap-6 p-6 max-[1100px]:flex-col max-md:w-full max-md:min-w-0 max-md:p-4"><div className="relative flex min-w-0 min-h-[680px] flex-[1_1_900px] flex-col overflow-hidden rounded-[18px] bg-room-stage px-8 pt-5 pb-[92px] min-[768px]:max-[1100px]:min-h-[640px] min-[768px]:max-[1100px]:flex-none max-md:h-auto max-md:min-h-0 max-md:flex-none max-md:overflow-visible max-md:px-4 max-md:pt-[18px] max-md:pb-6" role="region" aria-labelledby="participants-title"><div className="-mx-2 flex items-center justify-between gap-6 max-md:mx-0 max-md:flex-col max-md:items-start max-md:gap-2"><h2 className="font-['Inter_Variable',sans-serif] text-[13px] leading-[1.2] font-semibold text-[#cbd5e1]" id="participants-title">Participantes</h2>{sharing && <p className="inline-flex min-h-6 items-center rounded-xl bg-[#263b5b] px-3 font-['Inter_Variable',sans-serif] text-[11px] leading-none font-medium text-[#93c5fd]">Estás compartiendo el estado de tu pantalla</p>}</div><p className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label="Anuncios de participantes">{participantAnnouncement}</p><div className="mt-[22px] grid grid-cols-2 gap-x-3 gap-y-5 max-md:grid-cols-1 max-md:gap-3">{participants.map((participant, index) => <article className={`participant-card relative flex min-h-[244px] items-center justify-center rounded-2xl border min-[768px]:max-[1100px]:min-h-[210px] max-md:min-h-[168px] ${participantCardTones[index % 4]} ${participant.active ? 'border-[#60a5fa]' : 'border-[#334155]'}`} key={participant.id}><div className="participant-avatar grid h-16 w-16 place-items-center rounded-full bg-[#263b5b] font-['Inter_Variable',sans-serif] text-[28px] leading-none font-semibold text-[#bfdbfe]" aria-hidden="true">{participant.initials}</div><p className="participant-name absolute bottom-[15px] left-[15px] font-['Inter_Variable',sans-serif] text-[13px] leading-none font-semibold text-text">{participant.name}</p><div className="participant-status absolute right-[15px] bottom-[15px] flex gap-2 [&_img]:h-4 [&_img]:w-4"><img src={`/assets/figma/mic-${participant.microphone}.svg`} alt={participant.microphone === 'on' ? 'Micrófono activo' : 'Micrófono apagado'} /><img src={`/assets/figma/camera-${participant.camera}.svg`} alt={participant.camera === 'on' ? 'Cámara activa' : 'Cámara apagada'} /></div></article>)}</div><div className="absolute right-1/2 bottom-4 flex w-[min(612px,calc(100%-48px))] min-h-[68px] translate-x-1/2 items-center justify-center gap-2 rounded-2xl border border-[rgb(191_219_254_/_22%)] bg-[rgb(27_38_56_/_82%)] px-[10px] py-2 shadow-[0_6px_18px_rgb(2_8_24_/_32%)] min-[768px]:max-[1100px]:w-[min(612px,calc(100%-32px))] max-md:static max-md:right-auto max-md:bottom-auto max-md:mx-auto max-md:mt-5 max-md:w-full max-md:translate-x-0 max-md:flex-wrap" aria-label="Controles multimedia"><button className={`${mediaControlBase} w-[174px] ${connected && !mic ? `${mediaAlertTone} text-text` : mediaDefaultTone}`} type="button" disabled={!connected} aria-pressed={mic} onClick={() => { const next = !mic; setMic(next); emitMedia(next, camera); }}><img src={mic ? '/assets/figma/mic-on-control.svg' : '/assets/figma/mic-off-control.svg'} alt="" /><span>{mic ? 'Micrófono activo' : 'Micrófono silenciado'}</span></button><button className={`${mediaControlBase} w-[152px] ${connected && !camera ? `${mediaAlertTone} text-text` : mediaDefaultTone}`} type="button" disabled={!connected} aria-pressed={camera} onClick={() => { const next = !camera; setCamera(next); emitMedia(mic, next); }}><img src={camera ? '/assets/figma/camera-on-control.svg' : '/assets/figma/camera-off-control.svg'} alt="" /><span>{camera ? 'Cámara activa' : 'Cámara apagada'}</span></button><button className={`${mediaControlBase} w-[162px] ${connected && sharing ? `${mediaAlertTone} text-error` : mediaDefaultTone}`} type="button" disabled={!connected} aria-pressed={sharing} onClick={() => { const next = !sharing; setSharing(next); socketRef.current?.emit('screen:state', { sharing: next }); }}><img src="/assets/figma/share.svg" alt="" /><span>{sharing ? 'Dejar de compartir' : 'Compartir pantalla'}</span></button></div></div><aside className="room-side-panel flex h-[clamp(680px,calc(100dvh-140px),760px)] min-h-[680px] w-[468px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-border bg-surface px-[23px] pt-4 pb-[33px] max-[1100px]:h-auto max-[1100px]:min-h-[360px] max-[1100px]:w-full max-md:w-full max-md:min-w-0 max-md:p-4" id="room-side-panel" aria-label="Chat de sala"><div className="flex items-center justify-between gap-3"><h2 className="text-[17px]">Chat de la sala</h2><span>{connected ? 'Conectado' : 'Sin conexión'}</span></div><p className={chatStatus.className} role={chatStatus.role}>{chatStatus.text}</p><p className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label="Anuncios del chat">{chatAnnouncement}</p><div className="relative mt-7 flex min-h-0 flex-1 flex-col"><div className="room-chat-messages grid min-h-0 flex-1 content-start gap-4 overflow-auto focus:outline-none focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2 max-[1100px]:min-h-[180px] max-[1100px]:max-h-[45dvh] max-md:min-w-0 max-md:overflow-x-hidden" ref={messagesListRef} role="region" aria-label="Historial de mensajes" tabIndex={0} onScroll={handleMessagesScroll}>{nextCursor && historyStatus === 'ready' && !historyError && <button ref={loadMoreRef} className={`room-chat-load-more ${chatSecondaryBtn}`} type="button" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? 'Cargando mensajes anteriores…' : 'Ver más antiguos'}</button>}{historyStatus === 'loading' && <div className="grid gap-2.5" role="status"><span className="skeleton-block skeleton-shimmer block h-11 w-full rounded-[10px]" aria-hidden="true" /><span className="skeleton-block skeleton-shimmer block h-11 w-[78%] rounded-[10px]" aria-hidden="true" /><p className="text-[13px] leading-[1.4] text-muted">Cargando mensajes anteriores…</p></div>}{historyError && <div className="grid gap-2.5 rounded-[10px] border border-[#995360] bg-[#3a202b] px-[14px] py-2.5 text-[13px] text-error" role="alert"><p>{historyError}</p><button ref={retryRef} className={chatSecondaryBtn} type="button" disabled={loadingOlder} onClick={() => historyStatus === 'error' ? loadInitialHistory(true) : void loadOlderMessages(true)}>Reintentar</button></div>}{historyStatus === 'ready' && !historyError && messages.length === 0 && <p className="text-[13px] leading-[1.4] text-muted">Sin mensajes anteriores. Esta sala aún no tiene conversación.</p>}{messages.map(message => <article className="room-chat-message grid grid-cols-[30px_minmax(0,1fr)] items-start gap-3 max-md:min-w-0" key={message.id}><div className={`room-chat-avatar room-sidebar-avatar-${message.avatarTone} grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full font-['Inter_Variable',sans-serif] text-[11px] font-semibold ${chatAvatarTones[message.avatarTone]}`} aria-hidden="true">{message.initials}</div><div className="min-w-0 max-md:min-w-0 max-md:[overflow-wrap:anywhere]"><div className="room-chat-message-meta flex min-w-0 items-baseline justify-between gap-3 max-md:min-w-0"><strong className="min-w-0 overflow-hidden font-['Inter_Variable',sans-serif] text-xs leading-[1.2] font-semibold text-ellipsis whitespace-nowrap text-text">{message.sender}</strong><time className="shrink-0 text-[11px] text-[#cbd5e1] max-md:text-[10px]">{message.time}</time></div><p className="mt-[5px] text-[13px] leading-[1.35] text-[#cbd5e1] [overflow-wrap:anywhere] max-md:min-w-0">{message.text}</p></div></article>)}</div>{unreadCount > 0 && <button type="button" className="absolute bottom-3 left-1/2 z-[2] mt-0 min-h-9 max-w-[calc(100%-16px)] -translate-x-1/2 rounded-[10px] border border-[#286a56] bg-[#103c30] px-3 py-1.5 font-['Inter_Variable',sans-serif] text-xs leading-[1.2] font-semibold whitespace-nowrap text-success shadow-[0_6px_18px_rgb(2_6_23_/_55%)] hover:bg-[#144d3e] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-gap)] max-md:w-[calc(100%-16px)]" onClick={jumpToLatest}>{formatNewMessagesLabel(unreadCount)}</button>}</div><form className="mt-auto grid grid-cols-[minmax(0,1fr)_48px] gap-3 pt-[18px] max-md:min-w-0 max-[359px]:grid-cols-1" onSubmit={sendMessage}><label className="sr-only" htmlFor="room-chat-input">Mensaje para la sala</label><input className="h-[52px] w-full min-w-0 rounded-[10px] border border-border-strong bg-surface px-[15px] font-['Source_Sans_3_Variable',sans-serif] text-[13px] text-text placeholder:text-[#cbd5e1] placeholder:opacity-100" id="room-chat-input" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje para la sala…" /><button className="h-9 min-h-[44px] w-12 self-center rounded-lg border-0 bg-primary font-['Inter_Variable',sans-serif] text-[19px] leading-none font-semibold text-text hover:not-disabled:bg-primary-hover disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted disabled:opacity-65 max-[359px]:h-[44px] max-[359px]:w-full" type="submit" aria-label="Enviar mensaje" disabled={!connected || !draft.trim()}>↑</button></form>{chatError && <p role="alert" className={chatAlertBanner}>{chatError}</p>}{realtime !== 'error' && notice && <p role="status" className={chatAlertBanner}>{notice}</p>}{realtime === 'error' && canRetry && <button className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-[10px] border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-link-strong hover:bg-subtle" type="button" onClick={() => setRetry(value => value + 1)}>Reintentar conexión</button>}</aside></div></section>;
}
