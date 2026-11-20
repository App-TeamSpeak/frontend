import { expect, test, type Page, type TestInfo } from '@playwright/test';

const baseRoom = {
  roomId: 'room-calc-02',
  ownerId: 'us06-owner',
  name: 'Cálculo II - Grupo A',
  createdAt: '2026-11-18T20:00:00.000Z',
  participants: 4,
  connected: 4,
};

const historyMessages = [
  {
    id: 'msg-1',
    roomId: baseRoom.roomId,
    authorId: 'carlos-01',
    text: '¿Revisamos el ejercicio 3?',
    createdAt: '2026-11-18T14:21:00.000Z',
  },
  {
    id: 'msg-2',
    roomId: baseRoom.roomId,
    authorId: 'us06-owner',
    text: 'Sí, ya comparto mis apuntes.',
    createdAt: '2026-11-18T14:22:00.000Z',
  },
  {
    id: 'msg-3',
    roomId: baseRoom.roomId,
    authorId: 'laura-02',
    text: 'Yo tengo dudas en la segunda derivada.',
    createdAt: '2026-11-18T14:23:00.000Z',
  },
];

const responsiveSizes: Array<[number, number]> = [
  [768, 1024],
  [800, 600],
  [800, 360],
  [320, 640],
];

async function captureAllViewports(page: Page, info: TestInfo, mobile: boolean, stem: string) {
  const base = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(base);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(base.width);
  await page.screenshot({ path: info.outputPath(`${stem}.png`), scale: 'css' });
  if (!mobile) {
    for (const [width, height] of responsiveSizes) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`${stem}-${width}x${height}.png`), scale: 'css' });
    }
    await page.setViewportSize(base);
  }
}

async function stubInteriorAuthAndSocket(page: Page) {
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const firebaseAuth = { currentUser: { uid: 'us06-owner', emailVerified: true,
        getIdToken: async () => 'synthetic-room-token' } };
        export const firebaseApp = {};
        export const assertFirebaseConfiguration = () => {};`,
    }),
  );
  await page.route(/\/src\/services\/auth\.ts(\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('real')) {
      await route.continue();
      return;
    }
    url.searchParams.set('real', '1');
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        export * from ${JSON.stringify(url.pathname + url.search)};
        export const configureAuth = async () => {};
        export const subscribeToAuth = callback => {
          callback({ id: 'us06-owner', name: 'Ana Martínez', apellido: 'Martínez', username: 'ana_martinez',
            emailVerified: true, email: 'ana@example.test', avatarUrl: null });
          return () => {};
        };`,
    });
  });
  await page.route(/socket(?:__|\.)io-client\.js/, route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function io(_url, options) {
        if (options.auth.token !== 'synthetic-room-token') throw new Error('missing token');
        const listeners = new Map();
        const ioListeners = new Map();
        let lastJoinAck = null;
        let lastChatAck = null;
        let lastChatText = '';
        const socket = {
          id: 'sock-interior-1',
          connected: false,
          active: true,
          io: {
            on(name, cb) { ioListeners.set(name, cb); },
            off(name) { ioListeners.delete(name); },
          },
          removeAllListeners() { listeners.clear(); },
          on(name, cb) { listeners.set(name, cb); },
          connect() {
            window.__roomSocket = socket;
            window.__roomEmitServer = (event, payload) => {
              if (event === '__connect') {
                socket.connected = true;
                socket.active = true;
                listeners.get('connect')?.();
              } else if (event === '__ack_join') {
                lastJoinAck?.(payload ?? { ok: true });
              } else if (event === '__ack_chat') {
                lastChatAck?.(payload?.error ?? null, payload?.ack ?? { ok: true });
              } else if (event === '__disconnect') {
                socket.connected = false;
                socket.active = Boolean(payload?.active);
                listeners.get('disconnect')?.(payload?.reason ?? 'transport close');
              } else if (event === '__reconnect_failed') {
                socket.connected = false;
                socket.active = false;
                ioListeners.get('reconnect_failed')?.();
              } else {
                listeners.get(event)?.(payload);
              }
            };
          },
          emit(name, payload, ack) {
            if (name === 'room:join') {
              lastJoinAck = ack;
            }
          },
          volatile: {
            timeout() {
              return {
                emit(name, payload, ack) {
                  if (name === 'chat:send') {
                    lastChatText = payload?.text ?? '';
                    lastChatAck = ack;
                  }
                },
              };
            },
          },
          disconnect() {
            socket.connected = false;
            socket.active = false;
          },
        };
        return socket;
      }`,
    }),
  );
}

test('interior de sala: estados REST de carga, sala inexistente y acceso denegado', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubInteriorAuthAndSocket(page);

  let releaseRoom!: () => void;
  const pendingRoom = new Promise<void>(resolve => {
    releaseRoom = resolve;
  });
  let mode: 'loading-then-404' | '403' = 'loading-then-404';

  await page.route(`**/api/rooms/${baseRoom.roomId}`, async route => {
    if (mode === 'loading-then-404') {
      await pendingRoom;
      await route.fulfill({
        status: 404,
        json: { success: false, code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' },
      });
      return;
    }
    await route.fulfill({
      status: 403,
      json: { success: false, code: 'ROOM_ACCESS_DENIED', message: 'No tienes acceso a esta sala.' },
    });
  });

  await page.goto(`/salas/${baseRoom.roomId}`);
  await expect(page.getByRole('status')).toContainText('Preparando tu sala');
  await expect(page.getByRole('link', { name: 'Volver a mis salas' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-carga');

  releaseRoom();
  await expect(page.getByRole('alert')).toContainText('La sala no existe.');
  await expect(page.getByRole('link', { name: 'Volver a mis salas' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-inexistente');

  mode = '403';
  await page.goto(`/salas/${baseRoom.roomId}?caso=denegado`);
  await expect(page.getByRole('alert')).toContainText('No tienes acceso a esta sala.');
  await captureAllViewports(page, info, mobile, 'interior-denegado');
});

test('interior de sala: conexión en tiempo real, anfitrión, participantes, controles AV y pantalla compartida', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubInteriorAuthAndSocket(page);

  let currentOwner = 'us06-owner';
  await page.route(`**/api/rooms/${baseRoom.roomId}`, route =>
    route.fulfill({
      json: { success: true, data: { ...baseRoom, ownerId: currentOwner } },
    }),
  );
  await page.route(`**/api/rooms/${baseRoom.roomId}/messages`, route =>
    route.fulfill({
      json: { success: true, data: historyMessages },
    }),
  );

  await page.goto(`/salas/${baseRoom.roomId}`);
  await expect(page.getByRole('heading', { name: baseRoom.name })).toBeVisible();
  await expect(page.getByText('Conectando…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Micrófono silenciado' })).toBeDisabled();
  await captureAllViewports(page, info, mobile, 'interior-conectando');

  await page.evaluate(() => (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer('__connect'));
  await expect(page.getByText('Confirmando ingreso…')).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-confirmando');

  await page.evaluate(roomId => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('room:joined', { roomId, participants: ['us06-owner'] });
    emit('__ack_join', { ok: true });
  }, baseRoom.roomId);
  await expect(page.getByText('Ingreso confirmado')).toBeVisible();
  await expect(page.getByText('1 participantes')).toBeVisible();
  await expect(page.getByText(`Anfitrión · ID ${baseRoom.roomId}`)).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-anfitrion');

  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('room:participant-joined', { userId: 'carlos-01' });
    emit('room:participant-joined', { userId: 'laura-02' });
    emit('room:participant-joined', { userId: 'diego-03' });
  });
  await expect(page.getByText('4 participantes')).toBeVisible();
  await expect(page.locator('.participant-card')).toHaveCount(4);
  await captureAllViewports(page, info, mobile, 'interior-confirmado');
  await captureAllViewports(page, info, mobile, 'interior-base');

  // Controles de presencia de micrófono
  await page.getByRole('button', { name: 'Micrófono silenciado' }).click();
  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('media:state', { fromUserId: 'us06-owner', payload: { microphone: true, camera: false } });
  });
  await expect(page.getByRole('button', { name: 'Micrófono activo' })).toHaveAttribute('aria-pressed', 'true');
  await captureAllViewports(page, info, mobile, 'interior-presencia-microfono');

  // Controles de presencia de cámara
  await page.getByRole('button', { name: 'Cámara apagada' }).click();
  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('media:state', { fromUserId: 'us06-owner', payload: { microphone: true, camera: true } });
    emit('media:state', { fromUserId: 'carlos-01', payload: { microphone: true, camera: true } });
  });
  await expect(page.getByRole('button', { name: 'Cámara activa' })).toHaveAttribute('aria-pressed', 'true');
  await captureAllViewports(page, info, mobile, 'interior-presencia-camara');

  // Indicador de pantalla compartida
  await page.getByRole('button', { name: 'Compartir pantalla' }).click();
  await expect(page.getByRole('button', { name: 'Dejar de compartir' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Estás compartiendo el estado de tu pantalla')).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-pantalla-compartida');

  // Reconexión
  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__disconnect', { active: true, reason: 'transport close' });
  });
  await expect(page.getByText('Reconectando…')).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-reconexion');

  // Desconexión recuperable con botón Reintentar conexión
  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__reconnect_failed');
  });
  await expect(page.getByText('Realtime no disponible')).toBeVisible();
  await expect(page.getByText('No pudimos restablecer la conexión en tiempo real.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar conexión' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-desconexion');

  // Reintentar conexión como Miembro (Participantes) y luego Revocación
  currentOwner = 'otro-anfitrion';
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();
  await expect(page.getByText(`Miembro · ID ${baseRoom.roomId}`)).toBeVisible();
  await page.evaluate(roomId => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__connect');
    emit('room:joined', { roomId, participants: ['us06-owner', 'carlos-01', 'laura-02', 'diego-03'] });
    emit('__ack_join', { ok: true });
  }, baseRoom.roomId);
  await expect(page.getByText('Ingreso confirmado')).toBeVisible();
  await expect(page.locator('.participant-card')).toHaveCount(4);
  await captureAllViewports(page, info, mobile, 'interior-participantes');

  // Revocación de acceso en tiempo real
  await page.evaluate(roomId => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('room:access-revoked', { roomId, code: 'ROOM_ACCESS_DENIED' });
  }, baseRoom.roomId);
  await expect(page.getByText('Realtime no disponible')).toBeVisible();
  await expect(page.getByText('No tienes acceso a esta sala.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar conexión' })).toHaveCount(0);
  await captureAllViewports(page, info, mobile, 'interior-revocacion');
});

test('interior de sala: estados del chat (vacío, historial, envío, error de historial y error de envío)', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubInteriorAuthAndSocket(page);

  await page.route(`**/api/rooms/${baseRoom.roomId}`, route =>
    route.fulfill({
      json: { success: true, data: baseRoom },
    }),
  );

  let chatMode: 'empty' | 'history' | 'error' = 'empty';
  let releaseHistoryError!: () => void;
  const pendingHistoryError = new Promise<void>(resolve => {
    releaseHistoryError = resolve;
  });
  await page.route(`**/api/rooms/${baseRoom.roomId}/messages`, async route => {
    if (chatMode === 'error') {
      await pendingHistoryError;
      await route.fulfill({
        status: 503,
        json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'No disponible' },
      });
      return;
    }
    await route.fulfill({
      json: { success: true, data: chatMode === 'empty' ? [] : historyMessages },
    });
  });

  // 1. Chat vacío
  await page.goto(`/salas/${baseRoom.roomId}`);
  await expect(page.getByText('Conectando…')).toBeVisible();
  await page.waitForFunction(() => typeof (window as unknown as { __roomEmitServer?: unknown }).__roomEmitServer === 'function');
  await page.evaluate(roomId => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__connect');
    emit('room:joined', { roomId, participants: ['us06-owner', 'carlos-01'] });
    emit('__ack_join', { ok: true });
  }, baseRoom.roomId);
  await expect(page.getByText('Ingreso confirmado')).toBeVisible();
  await expect(page.locator('.room-chat-message')).toHaveCount(0);
  await captureAllViewports(page, info, mobile, 'interior-chat-vacio');

  // 2. Historial y Envío de mensaje + Error de envío
  chatMode = 'history';
  await page.goto(`/salas/${baseRoom.roomId}?chat=historial`);
  await expect(page.getByText('Conectando…')).toBeVisible();
  await page.waitForFunction(() => typeof (window as unknown as { __roomEmitServer?: unknown }).__roomEmitServer === 'function');
  await page.evaluate(roomId => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__connect');
    emit('room:joined', { roomId, participants: ['us06-owner', 'carlos-01', 'laura-02', 'diego-03'] });
    emit('__ack_join', { ok: true });
  }, baseRoom.roomId);
  await expect(page.locator('.room-chat-message')).toHaveCount(3);
  await captureAllViewports(page, info, mobile, 'interior-historial');

  const chatInput = page.getByLabel('Mensaje para la sala');
  await chatInput.fill('Revisemos el límite por partes antes del ejercicio 4.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('chat:message', {
      messageId: 'msg-4',
      authorId: 'us06-owner',
      text: 'Revisemos el límite por partes antes del ejercicio 4.',
      createdAt: '2026-11-18T14:25:00.000Z',
    });
    emit('__ack_chat', { ack: { ok: true } });
  });
  await expect(page.locator('.room-chat-message')).toHaveCount(4);
  await captureAllViewports(page, info, mobile, 'interior-envio-mensaje');

  // Error de envío
  await chatInput.fill('Mensaje pendiente por fallo temporal.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await page.evaluate(() => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__ack_chat', { ack: { ok: false } });
  });
  await expect(page.getByText('No pudimos enviar el mensaje.')).toBeVisible();
  await expect(chatInput).toHaveValue('Mensaje pendiente por fallo temporal.');
  await captureAllViewports(page, info, mobile, 'interior-error-envio');

  // 3. Error de historial
  chatMode = 'error';
  await page.goto(`/salas/${baseRoom.roomId}?chat=error-historial`);
  await expect(page.getByText('Conectando…')).toBeVisible();
  await page.waitForFunction(() => typeof (window as unknown as { __roomEmitServer?: unknown }).__roomEmitServer === 'function');
  await page.evaluate(roomId => {
    const emit = (window as unknown as { __roomEmitServer: (e: string, p?: unknown) => void }).__roomEmitServer;
    emit('__connect');
    emit('room:joined', { roomId, participants: ['us06-owner', 'carlos-01'] });
    emit('__ack_join', { ok: true });
  }, baseRoom.roomId);
  await expect(page.getByText('Ingreso confirmado')).toBeVisible();
  releaseHistoryError();
  await expect(page.getByText('No pudimos cargar el historial de mensajes.')).toBeVisible();
  await captureAllViewports(page, info, mobile, 'interior-error-historial');
});
