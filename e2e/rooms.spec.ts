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
    await route.fulfill({
      contentType: 'application/javascript', body: `
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
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => sessionStorage.setItem('us06-copied-id', value),
      }
    });
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
  if (!mobile) {
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await expect(confirmation.getByText(`ID ${room.roomId}`)).toBeVisible();
      const exit = confirmation.getByRole('link', { name: 'Entrar' });
      await exit.scrollIntoViewIfNeeded();
      await expect(exit).toBeInViewport();
      expect(await confirmation.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`crear-exito-${width}x${height}.png`), scale: 'css' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await confirmation.getByRole('button', { name: 'Ir a mis salas' }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: room.name }) });
  await expect(card.getByText(`ID ${room.roomId}`)).toBeVisible();
  await expect(card.getByText('1 participante')).toBeVisible();
  await expect(card.getByText('1 persona conectada ahora')).toBeVisible();
  await expect(card.getByText(/Última actividad/)).toBeVisible();
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
    await expect(page.getByRole('status')).toContainText('Creando sala…');
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

test('US-06 conserva accesibles los diálogos de administración y las rutas directas', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubRooms(page);
  await page.route('**/api/rooms', route => route.fulfill({ json: { success: true, data: [room] } }));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Unirse a sala' }).click();
  const join = page.getByRole('dialog', { name: 'Unirse a sala' });
  await expect(join.getByLabel('ID de la sala')).toBeFocused();
  await page.screenshot({ path: info.outputPath('US06-unirse-modal.png'), scale: 'css' });
  await join.getByRole('button', { name: 'Cancelar' }).click();

  const menu = page.getByRole('button', { name: 'Más opciones de Cálculo II' });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Editar sala' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar sala' });
  await expect(edit.getByLabel('Nombre de la sala')).toHaveValue(room.name);
  await page.screenshot({ path: info.outputPath('US06-editar-modal.png'), scale: 'css' });
  await edit.getByRole('button', { name: 'Cancelar' }).click();

  await menu.click();
  await page.getByRole('menuitem', { name: 'Eliminar sala' }).click();
  const remove = page.getByRole('dialog', { name: '¿Eliminar esta sala?' });
  await expect(remove.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.screenshot({ path: info.outputPath('US06-eliminar-modal.png'), scale: 'css' });
  await remove.getByRole('button', { name: 'Cancelar' }).click();

  await page.goto('/salas/crear');
  await expect(page.getByLabel('Nombre de la sala')).toBeVisible();
  await page.screenshot({ path: info.outputPath('US06-crear-ruta-directa.png'), scale: 'css' });
  await page.goto('/salas/unirse');
  await expect(page.getByLabel('ID de la sala')).toBeVisible();
  await page.screenshot({ path: info.outputPath('US06-unirse-ruta-directa.png'), scale: 'css' });
});

test('US-06 muestra el progreso y los errores en el diálogo que inició la operación', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubRooms(page);
  await page.route('**/api/rooms', route => route.fulfill({ json: { success: true, data: [room] } }));
  const capture = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`), scale: 'css' });
  const requests: string[] = [];
  let release!: () => void;
  const heldJoin = new Promise<void>(resolve => { release = resolve; });
  const errors = ['ROOM_NOT_FOUND', 'ROOM_ACCESS_DENIED', 'FIRESTORE_UNAVAILABLE'];
  let joins = 0;
  await page.route('**/api/rooms/*/join', async route => {
    expect(route.request().method()).toBe('POST');
    const code = errors[joins++];
    if (joins === 1) await heldJoin;
    if (code) {
      await route.fulfill({
        status: code === 'ROOM_NOT_FOUND' ? 404 : code === 'ROOM_ACCESS_DENIED' ? 403 : 503,
        json: { success: false, code, message: 'Error sintético' }
      });
    } else {
      await route.fulfill({ json: { success: true, data: room } });
    }
  });
  const releases = new Map<string, () => void>();
  await page.route(`**/api/rooms/${room.roomId}`, async route => {
    const method = route.request().method();
    if (method !== 'PATCH' && method !== 'DELETE') { await route.fallback(); return; }
    const alreadyTried = requests.includes(method);
    requests.push(method);
    if (!alreadyTried) {
      await new Promise<void>(resolve => releases.set(method, resolve));
      await route.fulfill({
        status: 503,
        json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'Error sintético' }
      });
      return;
    }
    if (method === 'PATCH') expect(route.request().postDataJSON()).toEqual({ name: 'Cálculo avanzado' });
    await route.fulfill({ json: { success: true, data: method === 'PATCH' ? { ...room, name: 'Cálculo avanzado' } : {} } });
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
  const openJoin = page.getByRole('button', { name: 'Unirse a sala' });
  await openJoin.click();
  const join = page.getByRole('dialog', { name: 'Unirse a sala' });
  const joinSubmit = join.getByRole('button', { name: 'Unirse a la sala' });
  await joinSubmit.click();
  await expect(join.getByRole('alert')).toContainText('Ingresa el código');
  await capture('unirse-vacio');
  await join.getByLabel('ID de la sala').fill(room.roomId);
  await capture('unirse-diligenciado');
  await joinSubmit.click();
  await expect(join.getByRole('status')).toContainText('Uniéndote a la sala…');
  await expect(joinSubmit).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(join).toBeVisible();
  await capture('unirse-procesando');
  release();
  await expect(join.getByRole('alert')).toContainText('La sala no existe.');
  await capture('unirse-inexistente');
  await joinSubmit.click();
  await expect(join.getByRole('alert')).toContainText('No tienes acceso a esta sala.');
  await capture('unirse-denegado');
  await joinSubmit.click();
  await expect(join.getByRole('alert')).toContainText('El servicio no está disponible');
  await capture('unirse-error');
  if (!mobile) {
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await joinSubmit.scrollIntoViewIfNeeded();
      await expect(joinSubmit).toBeInViewport();
      expect(await join.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await capture(`unirse-error-${width}x${height}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await join.getByRole('button', { name: 'Cancelar' }).click();
  await expect(openJoin).toBeFocused();

  await page.getByRole('button', { name: /Más opciones de Cálculo II/ }).click();
  await capture('sala-menu');
  await page.getByRole('menuitem', { name: 'Editar sala' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar sala' });
  const editName = edit.getByLabel('Nombre de la sala');
  const save = edit.getByRole('button', { name: 'Guardar cambios' });
  await editName.fill('');
  await save.click();
  await expect(edit.getByRole('alert')).toContainText('Revisa el nombre');
  await capture('editar-sala-validacion');
  await editName.fill('Cálculo avanzado');
  await save.click();
  await expect(edit.getByRole('status')).toContainText('Guardando cambios…');
  await expect(save).toBeDisabled();
  await capture('editar-sala-procesando');
  await expect.poll(() => releases.has('PATCH')).toBe(true);
  releases.get('PATCH')?.();
  await expect(edit.getByRole('alert')).toContainText('El servicio no está disponible');
  await expect(editName).toHaveValue('Cálculo avanzado');
  await capture('editar-sala-error');
  await save.click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cálculo avanzado' })).toBeVisible();
  await capture('editar-sala-guardada');

  await page.getByRole('button', { name: 'Más opciones de Cálculo avanzado' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar sala' }).click();
  const remove = page.getByRole('dialog', { name: '¿Eliminar esta sala?' });
  const deleteButton = remove.getByRole('button', { name: 'Eliminar sala' });
  await deleteButton.click();
  await expect(remove.getByRole('status')).toContainText('Eliminando sala…');
  await expect(deleteButton).toBeDisabled();
  await capture('eliminar-sala-procesando');
  await expect.poll(() => releases.has('DELETE')).toBe(true);
  releases.get('DELETE')?.();
  await expect(remove.getByRole('alert')).toContainText('El servicio no está disponible');
  await capture('eliminar-sala-error');
  await deleteButton.click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No tienes salas' })).toBeVisible();
  await capture('eliminar-sala-completada');
  expect(requests).toEqual(['PATCH', 'PATCH', 'DELETE', 'DELETE']);

  await openJoin.click();
  await join.getByLabel('ID de la sala').fill(room.roomId);
  await joinSubmit.click();
  await expect(page).toHaveURL(new RegExp(`/salas/${room.roomId}$`));
  await capture('unirse-acceso');
  expect(joins).toBe(4);
});

test('US-06 mantiene legibles las tarjetas con nombres y códigos largos', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const base = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(base);
  await stubRooms(page);
  const ownRooms = Array.from({ length: 6 }, (_, i) => ({
    ...room, roomId: `id-largo-${i}-${'synthetic'.repeat(7)}`,
    name: i === 0 ? 'Proyecto de arquitectura de software y estructuras para el grupo de estudio' : `Grupo de estudio ${i + 1}`,
  }));
  let count = 1;
  await page.route('**/api/rooms', route => route.fulfill({
    json: { success: true, data: [...ownRooms.slice(0, count), { ...room, roomId: 'foreign', name: 'Sala ajena', ownerId: 'otro' }] },
  }));
  for (count of [1, 2, 3, 6]) {
    await page.goto('/dashboard');
    await expect(page.locator('.room-card')).toHaveCount(count);
    await expect(page.getByRole('heading', { name: 'Sala ajena' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`dashboard-capacidad-${count}.png`), fullPage: true, scale: 'css' });
  }
  if (mobile) return;
  for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
    await page.setViewportSize({ width, height });
    const enter = page.getByRole('link', { name: /Entrar/ }).first();
    await enter.scrollIntoViewIfNeeded();
    await expect(enter).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: info.outputPath(`dashboard-responsivo-${width}x${height}.png`), scale: 'css' });
  }
});

test('US-06 conserva la geometría visual de /salas/unirse y JoinRoomForm', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await stubRooms(page);

  let releaseJoin!: () => void;
  await page.route('**/api/rooms/*/join', async route => {
    await new Promise<void>(resolve => { releaseJoin = resolve; });
    await route.fulfill({ json: { success: true, data: room } });
  });

  await page.goto('/salas/unirse');
  const section = page.locator('.room-join-page');
  await expect(section).toBeVisible();
  const label = page.locator('label[for="room-entry"]');
  const input = page.getByLabel('ID de la sala');
  const cancel = page.getByRole('link', { name: 'Cancelar' });
  const submit = page.getByRole('button', { name: 'Unirse a la sala' });

  const [sectionBox, labelBox, inputBox, cancelBox, submitBox] = await Promise.all([
    section.boundingBox(),
    label.boundingBox(),
    input.boundingBox(),
    cancel.boundingBox(),
    submit.boundingBox(),
  ]);
  expect(sectionBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(submitBox).not.toBeNull();

  if (!mobile) {
    expect(sectionBox!.width).toBeLessThanOrEqual(500);
    expect(Math.abs((sectionBox!.x + sectionBox!.width / 2) - (viewport.width / 2))).toBeLessThanOrEqual(4);
    expect(Math.round(inputBox!.height)).toBe(54);
    expect(Math.round(cancelBox!.width)).toBe(130);
    expect(Math.round(submitBox!.width)).toBe(164);
  } else {
    expect(Math.round(inputBox!.height)).toBe(51);
  }
  expect(inputBox!.y - (labelBox!.y + labelBox!.height)).toBeLessThanOrEqual(10);
  expect(Math.abs(cancelBox!.y - submitBox!.y)).toBeLessThanOrEqual(2);
  expect(submitBox!.x).toBeGreaterThan(cancelBox!.x + cancelBox!.width);

  await submit.click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await input.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgb(248, 113, 113)');

  await input.fill('CALC-8F2K');
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Uniéndote a la sala…');
  releaseJoin();
  await expect(page).toHaveURL(/\/salas\/synthetic-room-id$/);
});

test('Fase 4A conserva la geometría visual del dashboard, tarjetas y estados', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await stubRooms(page);

  let mode: 'hold' | 'error' | 'empty' | 'one' = 'hold';
  let releaseLoad!: () => void;
  await page.route('**/api/rooms', async route => {
    if (mode === 'hold') {
      await new Promise<void>(resolve => { releaseLoad = resolve; });
      await route.fulfill({ status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'Error sintético' } });
      return;
    }
    if (mode === 'error') {
      await route.fulfill({ status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'Error sintético' } });
      return;
    }
    if (mode === 'empty') {
      await route.fulfill({ json: { success: true, data: [] } });
      return;
    }
    await route.fulfill({ json: { success: true, data: [room] } });
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Estamos obteniendo tus salas.')).toBeVisible();
  const visibleSkeletons = await page.locator('.room-card-skeleton').evaluateAll(
    nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').length,
  );
  expect(visibleSkeletons).toBe(mobile ? 2 : 4);
  const skeletonBorder = await page.locator('.room-card-skeleton').first().evaluate(node => ({
    width: getComputedStyle(node).borderTopWidth,
    color: getComputedStyle(node).borderTopColor,
  }));
  expect(skeletonBorder).toEqual({ width: '1px', color: 'rgb(100, 116, 139)' });

  mode = 'error';
  releaseLoad();
  const retry = page.getByRole('button', { name: 'Reintentar' });
  await expect(retry).toBeVisible();
  const retryBox = await retry.boundingBox();
  expect(retryBox).not.toBeNull();
  if (!mobile) expect(Math.round(retryBox!.width)).toBe(168);

  mode = 'empty';
  await retry.click();
  const createFirst = page.getByRole('button', { name: 'Crear mi primera sala' });
  await expect(createFirst).toBeVisible();
  const createFirstBox = await createFirst.boundingBox();
  expect(createFirstBox).not.toBeNull();
  if (!mobile) expect(Math.round(createFirstBox!.width)).toBe(360);

  mode = 'one';
  await page.goto('/dashboard');
  const card = page.locator('.room-card');
  await expect(card).toHaveCount(1);
  const cardBox = await card.boundingBox();
  expect(cardBox).not.toBeNull();
  if (!mobile) expect(cardBox!.width).toBeLessThanOrEqual(524);
  const idTypography = await card.locator('.room-card-id').evaluate(node => ({
    fontSize: getComputedStyle(node).fontSize,
    lineHeight: getComputedStyle(node).lineHeight,
  }));
  expect(idTypography).toEqual({ fontSize: '12px', lineHeight: '16px' });
});

test('Fase 4B conserva la geometría visual de creación, copia de ID y diálogos de gestión', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubRooms(page);
  await page.route('**/api/rooms', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { success: true, data: room } });
      return;
    }
    await route.fulfill({ json: { success: true, data: [room] } });
  });

  await page.goto('/dashboard');
  const copyBtn = page.getByRole('button', { name: 'Copiar ID' }).first();
  const copyBox = await copyBtn.boundingBox();
  expect(copyBox).not.toBeNull();
  expect(Math.round(copyBox!.width)).toBe(28);
  expect(Math.round(copyBox!.height)).toBe(28);

  await page.getByRole('button', { name: '＋ Crear sala' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Crear sala' });
  await expect(createDialog).toBeVisible();
  const backdropBg = await createDialog.evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor);
  expect(backdropBg).toBe('rgba(2, 6, 23, 0.72)');
  const createBox = await createDialog.boundingBox();
  expect(createBox).not.toBeNull();
  expect(createBox!.width).toBeLessThanOrEqual(mobile ? 358 : 500);
  await createDialog.getByRole('button', { name: 'Crear sala' }).click();
  await expect(createDialog.getByRole('alert')).toContainText('Ingresa un nombre de entre 1 y 80 caracteres.');
  const createErrorBox = await createDialog.boundingBox();
  expect(createErrorBox).not.toBeNull();
  expect(createErrorBox!.height).toBeLessThanOrEqual(365);
  await createDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: `Más opciones de ${room.name}` }).click();
  await page.getByRole('menuitem', { name: 'Editar sala' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar sala' });
  await expect(editDialog).toBeVisible();
  const editBox = await editDialog.boundingBox();
  const readonlyId = editDialog.getByLabel('ID de la sala');
  const readonlyBox = await readonlyId.boundingBox();
  expect(editBox).not.toBeNull();
  expect(readonlyBox).not.toBeNull();
  expect(editBox!.width).toBeLessThanOrEqual(mobile ? 358 : 500);
  expect(Math.round(readonlyBox!.height)).toBe(48);
  await editDialog.getByLabel('Nombre de la sala').fill('');
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
  expect(await editDialog.getByLabel('Nombre de la sala').evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgb(248, 113, 113)');
  await editDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: '＋ Unirse a sala' }).click();
  const joinDialog = page.getByRole('dialog', { name: 'Unirse a sala' });
  await expect(joinDialog).toBeVisible();
  const joinBox = await joinDialog.boundingBox();
  expect(joinBox).not.toBeNull();
  expect(joinBox!.width).toBeLessThanOrEqual(mobile ? 358 : 500);
  const joinCancel = joinDialog.getByRole('button', { name: 'Cancelar' });
  const joinSubmit = joinDialog.getByRole('button', { name: 'Unirse a la sala' });
  const [jcBox, jsBox] = await Promise.all([joinCancel.boundingBox(), joinSubmit.boundingBox()]);
  expect(Math.abs(jcBox!.y - jsBox!.y)).toBeLessThanOrEqual(2);
  await joinSubmit.click();
  await expect(joinDialog.getByRole('alert')).toBeVisible();
  const [jcAfterBox, jsAfterBox] = await Promise.all([joinCancel.boundingBox(), joinSubmit.boundingBox()]);
  expect(Math.abs(jcAfterBox!.y - jcBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(jsAfterBox!.y - jsBox!.y)).toBeLessThanOrEqual(1);
  await joinCancel.click();
});
