import { expect, test, type Page } from '@playwright/test';

const room = {
  roomId: 'synthetic-room-id', ownerId: 'us06-owner', name: 'Cálculo II',
  createdAt: '2026-11-18T20:00:00.000Z', participants: 1, connected: 1,
};

async function stubRooms(page: Page, scenario: 'standard' | 'success' | 'uncertain' = 'standard') {
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const firebaseAuth = { currentUser: { uid: 'us06-owner', emailVerified: true,
      getIdToken: async () => 'synthetic-room-token' } };
      export const firebaseApp = {};
      export const assertFirebaseConfiguration = () => {};`,
  }));
  await page.route(/\/src\/services\/auth\.ts(\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('real')) { await route.continue(); return; }
    url.searchParams.set('real', '1');
    await route.fulfill({ contentType: 'application/javascript', body: `
      export * from ${JSON.stringify(url.pathname + url.search)};
      export const configureAuth = async () => {};
      export const subscribeToAuth = callback => {
        callback({ id: 'us06-owner', name: 'María', apellido: 'Gómez', username: 'maria_gomez',
          emailVerified: true, email: 'maria@example.test', avatarUrl: null });
        return () => {};
      };` });
  });
  await page.route(/socket(?:__|\.)io-client\.js/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function io(_url, options) {
      if (options.auth.token !== 'synthetic-room-token') throw new Error('missing token');
      const listeners = new Map();
      return {
        connected: true, active: true, io: { on() {}, off() {} },
        removeAllListeners() { listeners.clear(); },
        on(name, callback) { listeners.set(name, callback); },
        connect() {
          queueMicrotask(() => listeners.get('connect')?.());
          window.addEventListener('us06-disconnect', () => {
            this.connected = false;
            this.active = false;
            listeners.get('error:message')?.({ code: 'ACCOUNT_UNAVAILABLE' });
            listeners.get('disconnect')?.('io server disconnect');
          }, { once: true });
        },
        emit(name, payload, ack) {
          if (name === 'room:join') {
            window.addEventListener('us06-confirm-join', () => {
              listeners.get('room:joined')?.({ roomId: payload.roomId, participants: ['us06-owner'] });
              ack?.({ ok: true });
            }, { once: true });
          }
        },
        disconnect() {},
      };
    }`,
  }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (value: string) => sessionStorage.setItem('us06-copied-id', value),
    } });
  });
  let created = false;
  let listUnavailable = true;
  let finishList!: () => void;
  const pendingList = new Promise<void>(resolve => { finishList = resolve; });
  const posts: unknown[] = [];
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/rooms', async route => {
    expect(route.request().headers().authorization).toBe('Bearer synthetic-room-token');
    if (route.request().method() !== 'POST') {
      if (listUnavailable) {
        await pendingList;
        await route.fulfill({ status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'No disponible' } });
        return;
      }
      await route.fulfill({ json: { success: true, data: created ? [room] : [] } });
      return;
    }
    posts.push(route.request().postDataJSON());
    if (posts.length === 1 && scenario === 'standard') {
      await route.fulfill({ status: 429, json: { success: false, code: 'RATE_LIMIT', message: 'Error' } });
      return;
    }
    await pending;
    if (posts.length === 1 && scenario === 'uncertain') {
      await route.fulfill({ status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'No disponible' } });
      return;
    }
    created = true;
    await route.fulfill({ status: 201, json: { success: true, data: room } });
  });
  await page.route(`**/api/rooms/${room.roomId}`, route => route.fulfill({ json: { success: true, data: room } }));
  await page.route(`**/api/rooms/${room.roomId}/messages`, route => route.fulfill({ json: { success: true, data: [] } }));
  return { posts, finish, finishList, enableList: () => { listUnavailable = false; } };
}

test('crea una sala propia, copia el ID real y confirma el ingreso como anfitrión', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { posts, finish, finishList, enableList } = await stubRooms(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('status')).toContainText('Estamos obteniendo tus salas');
  await page.screenshot({ path: info.outputPath('dashboard-cargando.png'), scale: 'css' });
  finishList();
  await expect(page.getByRole('alert')).toContainText('El servicio no está disponible');
  await page.screenshot({ path: info.outputPath('dashboard-error.png'), scale: 'css' });
  enableList();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'No tienes salas' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard-vacio.png'), scale: 'css' });

  const opener = page.getByRole('button', { name: 'Crear mi primera sala' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Crear sala', exact: true });
  const name = dialog.getByRole('textbox', { name: 'Nombre de la sala' });
  await expect(name).toBeFocused();
  await page.screenshot({ path: info.outputPath('crear-vacio.png'), scale: 'css' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');

  await dialog.getByRole('button', { name: 'Crear sala' }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  await page.screenshot({ path: info.outputPath('crear-validacion.png'), scale: 'css' });
  await name.fill(' Cálculo II ');
  await page.screenshot({ path: info.outputPath('crear-diligenciado.png'), scale: 'css' });
  await dialog.getByRole('button', { name: 'Crear sala' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No pudimos crear la sala');
  await expect(name).toHaveValue(' Cálculo II ');
  await page.screenshot({ path: info.outputPath('crear-error.png'), scale: 'css' });
  await dialog.getByRole('button', { name: 'Reintentar' }).click();
  await expect(dialog.getByRole('status')).toContainText('Creando sala');
  await expect(dialog.getByRole('button', { name: 'Creando…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('crear-guardando.png'), scale: 'css' });
  finish();

  const confirmation = page.getByRole('dialog', { name: 'Sala creada correctamente' });
  await expect(confirmation.getByRole('heading')).toBeFocused();
  await expect(confirmation.getByText(room.name)).toBeVisible();
  await page.screenshot({ path: info.outputPath('crear-exito.png'), scale: 'css' });
  await confirmation.getByRole('button', { name: 'Ir a mis salas' }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: room.name }) });
  await expect(card.getByText(`ID ${room.roomId}`)).toBeVisible();
  await expect(card.getByText('1 miembro')).toBeVisible();
  const copy = card.getByRole('button', { name: 'Copiar ID' });
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('status')).toHaveText('ID copiado.');
  expect(await page.evaluate(() => sessionStorage.getItem('us06-copied-id'))).toBe(room.roomId);
  expect(posts).toEqual([{ name: room.name }, { name: room.name }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile ? 390 : 1440);
  await page.screenshot({ path: info.outputPath('dashboard-con-sala.png'), scale: 'css' });

  await card.getByRole('link', { name: 'Entrar' }).click();
  await expect(page.getByText(`Anfitrión · ID ${room.roomId}`)).toBeVisible();
  await expect(page.getByText('Confirmando ingreso…')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('us06-confirm-join')));
  await expect(page.getByText('Ingreso confirmado')).toBeVisible();
  await page.screenshot({ path: info.outputPath('sala-anfitrion.png'), scale: 'css' });
  await page.evaluate(() => window.dispatchEvent(new Event('us06-disconnect')));
  await expect(page.getByText('Realtime no disponible')).toBeVisible();
  await expect(page.locator('.room-header').getByText('Tu sesión no tiene autorización para el ingreso en tiempo real.')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('sala-desconexion-terminal.png'), scale: 'css' });
});

for (const scenario of ['success', 'uncertain'] as const) {
  test(`conserva la creación compartida al salir de la ruta directa con resultado ${scenario}`, async ({ page }, info) => {
    const mobile = info.project.name.endsWith('mobile');
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const { posts, finish, finishList, enableList } = await stubRooms(page, scenario);
    await page.goto('/salas/crear');
    const name = page.getByRole('textbox', { name: 'Nombre de la sala' });
    await name.fill('  Cálculo II  ');
    await page.getByRole('button', { name: 'Crear sala', exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    await page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' }).click();
    await expect(page).toHaveURL(/\/salas\/crear$/);
    await expect(page.getByRole('status')).toHaveText('Creando sala…');
    await page.screenshot({ path: info.outputPath('creacion-navegacion-pendiente.png'), scale: 'css' });
    if (scenario === 'success') enableList();
    finishList();
    finish();
    if (scenario === 'success') {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    } else {
      await expect(page.getByRole('alert')).toContainText('No pudimos actualizar tus salas');
      await expect(page).toHaveURL(/\/salas\/crear$/);
      enableList();
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await page.getByRole('button', { name: 'Crear mi primera sala' }).click();
      const dialog = page.getByRole('dialog', { name: 'Crear sala' });
      await expect(dialog.getByRole('alert')).toContainText('podría haberse completado');
      await expect(dialog.getByRole('textbox')).toHaveValue('  Cálculo II  ');
      await dialog.getByRole('button', { name: 'Actualizar mis salas' }).click();
      await expect(dialog.getByRole('region', { name: 'Salas actualizadas' })).toBeVisible();
      await page.screenshot({ path: info.outputPath('creacion-resultado-incierto.png'), scale: 'css' });
      expect(posts).toHaveLength(1);
      await page.keyboard.press('Escape');
      await page.evaluate(() => history.back());
      await expect(page).toHaveURL(/\/salas\/crear$/);
      await expect(page.getByRole('region', { name: 'Salas actualizadas' })).toBeVisible();
      expect(posts).toHaveLength(1);
      await page.getByRole('button', { name: 'Crear otra vez' }).click();
      await expect(page.getByRole('heading', { name: 'Sala creada correctamente' })).toBeVisible();
    }
    expect(posts).toHaveLength(scenario === 'success' ? 1 : 2);
  });
}

test('Atrás y Escape recuperan el control cuando vence el POST', async ({ page }) => {
  await page.clock.install();
  const { posts, finish, enableList } = await stubRooms(page, 'success');
  enableList();
  await page.goto('/salas/crear');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Crear mi primera sala' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear sala' });
  await dialog.getByRole('textbox').fill(room.name);
  await dialog.getByRole('button', { name: 'Crear sala' }).click();
  await expect.poll(() => posts.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

  await page.clock.fastForward(20_000);
  await expect(dialog.getByRole('alert')).toContainText('La sala podría haberse creado');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/salas\/crear$/);
  await expect(page.getByRole('alert')).toContainText('La sala podría haberse creado');
  finish();
  expect(posts).toHaveLength(1);
});
