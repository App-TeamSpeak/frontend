import { expect, test, type Page } from '@playwright/test';

const initial = {
  uid: 'us04-test', nombre: 'María', apellido: 'Gómez', username: 'maria_gomez',
  usernameKey: 'maria_gomez', email: 'maria@example.test', avatarUrl: null,
  profileStatus: 'complete', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

async function stubProfile(page: Page, missingUsername = false, pendingOutcome?: 'success' | 'failure') {
  let profile = { ...initial };
  let failLoad = true;
  let profileError: { status: number; code: string } | undefined;
  let releaseLoad!: () => void;
  let releaseSave!: () => void;
  const loadGate = new Promise<void>(resolve => { releaseLoad = resolve; });
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  let saveAttempt = 0;
  const patches: Record<string, unknown>[] = [];

  // Stubs apply to this browser context. The actual page, HTTP client and PATCH service run.
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const firebaseAuth = { currentUser: { uid: 'us04-test', email: 'maria@example.test',
      emailVerified: true, getIdToken: async () => 'synthetic-id-token' } };
      export const firebaseApp = {};
      export const assertFirebaseConfiguration = () => {};`,
  }));
  await page.route(/\/src\/services\/auth\.ts(\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('real')) { await route.continue(); return; }
    url.searchParams.set('real', '1');
    await route.fulfill({ contentType: 'application/javascript', body: `
      export * from ${JSON.stringify(url.pathname + url.search)};
      import { firebaseAuth } from '/src/firebase.ts';
      export const configureAuth = async () => {};
      export const logoutUser = async () => {
        firebaseAuth.currentUser = null;
        window.dispatchEvent(new Event('teamspeak-test-logout'));
      };
      export const subscribeToAuth = (callback) => {
        callback({ id: 'us04-test', name: 'María', apellido: 'Gómez', username: ${missingUsername ? 'undefined' : JSON.stringify(initial.username)},
          email: 'maria@example.test', avatarUrl: null, emailVerified: true });
        const switchUser = () => {
          firebaseAuth.currentUser = { uid: 'second-test', email: 'second@example.test',
            emailVerified: true, getIdToken: async () => 'second-token' };
          callback({ id: 'second-test', name: 'Julia', apellido: 'Prueba', username: 'julia_test',
            email: 'second@example.test', avatarUrl: null, emailVerified: true });
        };
        window.addEventListener('teamspeak-test-switch', switchUser);
        const logout = () => callback(null);
        window.addEventListener('teamspeak-test-logout', logout);
        return () => {
          window.removeEventListener('teamspeak-test-switch', switchUser);
          window.removeEventListener('teamspeak-test-logout', logout);
        };
      };` });
  });
  await page.route('**/api/rooms', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.route('**/api/users/me', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    const authorization = route.request().headers().authorization;
    if (authorization === 'Bearer second-token') {
      const second = { ...initial, uid: 'second-test', nombre: 'Julia', apellido: 'Prueba',
        username: 'julia_test', usernameKey: 'julia_test', email: 'second@example.test' };
      await route.fulfill({ json: { success: true, data: { uid: second.uid, profileStatus: 'complete', profile: second } } });
      return;
    }
    expect(authorization).toBe('Bearer synthetic-id-token');
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON();
      patches.push(patch);
      saveAttempt += 1;
      if (saveAttempt === 1) {
        await saveGate;
        if (pendingOutcome !== 'success') {
          await route.fulfill(pendingOutcome === 'failure'
            ? { status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'No disponible' } }
            : { status: 409, json: { success: false, code: 'USERNAME_TAKEN', message: 'Ocupado' } });
          return;
        }
      }
      if (saveAttempt === 2 && !pendingOutcome) {
        await route.fulfill({ status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'No disponible' } });
        return;
      }
      profile = { ...profile, ...patch };
    } else if (profileError) {
      await route.fulfill({ status: profileError.status, json: { success: false, code: profileError.code, message: 'Perfil no disponible' } });
      return;
    } else if (failLoad) {
      await loadGate;
      await route.fulfill({ status: 503, json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'No disponible' } });
      return;
    }
    await route.fulfill({ json: { success: true, data: { uid: profile.uid, profileStatus: 'complete', profile } } });
  });
  return {
    patches, releaseLoad, releaseSave,
    enableLoad: () => { failLoad = false; },
    setProfileError: (error?: { status: number; code: string }) => { profileError = error; },
  };
}

test('consulta, edición, recuperación de errores y descarte de perfil', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { patches, releaseLoad, releaseSave, enableLoad } = await stubProfile(page, true);
  await page.goto('/perfil');
  const main = page.getByRole('main');
  await expect(main.getByRole('status')).toContainText('Cargando perfil');
  await page.screenshot({ path: info.outputPath('cargando.png'), scale: 'css' });
  releaseLoad();
  await expect(main.getByRole('alert')).toContainText('El servicio no está disponible');
  await page.screenshot({ path: info.outputPath('error-consulta.png'), scale: 'css' });
  enableLoad();
  await main.getByRole('button', { name: 'Reintentar' }).click();
  await expect(main.getByText('maria_gomez')).toBeVisible();
  await page.screenshot({ path: info.outputPath('perfil.png'), scale: 'css' });
  await main.getByRole('button', { name: 'Editar perfil' }).click();
  const nombre = main.getByLabel('Nombre', { exact: true });
  const username = main.getByLabel('Nombre de usuario');
  await expect(main.getByLabel('Correo electrónico')).toHaveAttribute('readonly', '');
  await page.screenshot({ path: info.outputPath('editar.png'), scale: 'css' });
  await username.fill('maria.gomez');
  await main.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute('aria-invalid', 'true');
  await page.screenshot({ path: info.outputPath('datos-invalidos.png'), scale: 'css' });
  await username.fill('maria_test');
  const cancelar = main.getByRole('button', { name: 'Cancelar', exact: true });
  await cancelar.click();
  const dialog = page.getByRole('dialog', { name: '¿Descartar cambios?' });
  await expect(dialog.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.screenshot({ path: info.outputPath('descarte.png'), scale: 'css' });
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Descartar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cancelar).toBeFocused();
  await expect(username).toHaveValue('maria_test');
  await cancelar.click();
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await main.getByRole('button', { name: 'Editar perfil' }).click();
  await expect(username).toHaveValue(initial.username);
  await username.fill('maria_test');
  await nombre.fill('María Elena');
  await main.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(main.getByRole('status')).toContainText('Guardando cambios');
  await expect(main.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('guardando.png'), scale: 'css' });
  releaseSave();
  await expect(main.getByRole('alert')).toContainText('ya está en uso');
  await expect(nombre).toHaveValue('María Elena');
  await username.fill('maria_final');
  await main.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(main.getByRole('alert')).toContainText('El servicio no está disponible');
  await expect(username).toHaveValue('maria_final');
  await page.screenshot({ path: info.outputPath('error-guardado.png'), scale: 'css' });
  await main.getByRole('button', { name: 'Reintentar' }).click();
  await expect(main.getByRole('status')).toContainText('Cambios guardados');
  await page.screenshot({ path: info.outputPath('guardado.png'), scale: 'css' });
  expect(patches).toEqual([
    { nombre: 'María Elena', username: 'maria_test' },
    { nombre: 'María Elena', username: 'maria_final' },
    { nombre: 'María Elena', username: 'maria_final' },
  ]);
  await main.getByRole('button', { name: 'Volver al perfil' }).click();
  await expect(main.getByText('maria_final')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile ? 390 : 1440);
  await page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('protege el borrador al navegar, volver o recargar y recupera el contexto desde GET', async ({ page }, info) => {
  await page.setViewportSize(info.project.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad, patches } = await stubProfile(page, true);
  enableLoad();
  await page.goto('/perfil');
  const dashboard = page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' });
  const profile = page.getByRole('link', { name: 'Perfil', exact: true });
  const edit = () => page.getByRole('button', { name: 'Editar perfil' }).click();
  const name = page.getByRole('textbox', { name: 'Nombre', exact: true });
  const discard = page.getByRole('dialog', { name: '¿Descartar cambios?' });

  await edit();
  await name.fill(' María ');
  await dashboard.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(discard).toHaveCount(0);

  await profile.click();
  await edit();
  await name.fill('María Temporal');
  await dashboard.click();
  await expect(discard.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.screenshot({ path: info.outputPath('salida-bloqueada.png'), scale: 'css' });
  await page.keyboard.press('Escape');
  await expect(name).toHaveValue('María Temporal');
  await expect(dashboard).toBeFocused();

  await page.evaluate(() => history.back());
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(name).toHaveValue('María Temporal');

  const nativeDialog = new Promise<string>(resolve => page.once('dialog', async dialog => {
    await dialog.dismiss();
    resolve(dialog.type());
  }));
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  expect(await nativeDialog).toBe('beforeunload');
  await expect(name).toHaveValue('María Temporal');

  await page.evaluate(() => history.back());
  await discard.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(patches).toEqual([]);
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);

  await profile.click();
  await edit();
  await name.fill('Borrador de salida');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('dialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(discard).toHaveCount(0);
  expect(patches).toEqual([]);
});

test('una consulta de la cuenta anterior no reemplaza la identidad vigente', async ({ page }) => {
  const { releaseLoad } = await stubProfile(page);
  await page.goto('/perfil');
  await expect(page.getByText('Cargando perfil…')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('teamspeak-test-switch')));
  await expect(page.getByText('second@example.test')).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/users/me') && response.status() === 503);
  releaseLoad();
  await (await oldResponse).finished();
  await expect(page.getByText('julia_test')).toBeVisible();
  await expect(page.getByText('maria_gomez')).toHaveCount(0);
});

for (const outcome of ['success', 'failure'] as const) {
  test(`navegación durante PATCH pendiente con resultado ${outcome}`, async ({ page }, info) => {
    await page.setViewportSize(info.project.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const { enableLoad, releaseSave, patches } = await stubProfile(page, false, outcome);
    enableLoad();
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Perfil', exact: true }).click();
    await page.getByRole('button', { name: 'Editar perfil' }).click();
    const name = page.getByRole('textbox', { name: 'Nombre', exact: true });
    await name.fill('Elena');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect.poll(() => patches.length).toBe(1);
    const dashboard = page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' });
    if (outcome === 'success') await dashboard.click();
    else await page.evaluate(() => history.back());
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
    await expect(page.getByRole('dialog', { name: '¿Descartar cambios?' })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardando cambios…');
    await expect(page.getByRole('link', { name: 'Perfil', exact: true })).toHaveText('M');
    await page.screenshot({ path: info.outputPath('guardado-con-salida.png'), scale: 'css' });
    releaseSave();

    if (outcome === 'success') {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole('link', { name: 'Perfil', exact: true })).toHaveText('E');
    } else {
      const dialog = page.getByRole('dialog', { name: '¿Descartar cambios?' });
      await dialog.getByRole('button', { name: 'Seguir editando' }).click();
      await expect(name).toHaveValue('Elena');
      await expect(page.getByRole('alert')).toContainText('El servicio no está disponible');
      await expect(page.getByRole('link', { name: 'Perfil', exact: true })).toHaveText('M');
      await page.getByRole('button', { name: 'Reintentar' }).click();
      await expect(page.getByText('Cambios guardados.')).toBeVisible();
    }
    expect(patches).toEqual(outcome === 'success' ? [{ nombre: 'Elena' }] : [{ nombre: 'Elena' }, { nombre: 'Elena' }]);
  });
}

test('un perfil previamente confirmado pierde acceso privado y recupera el dashboard al reintentar', async ({ page }) => {
  const { enableLoad, setProfileError } = await stubProfile(page);
  enableLoad();
  await page.goto('/perfil');
  await expect(page.getByText('maria_gomez')).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  setProfileError({ status: 409, code: 'PROFILE_INCONSISTENT' });
  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('requiere revisión');
  await page.getByRole('main').getByRole('link', { name: 'Mis salas' }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole('alert')).toContainText('requiere revisión');
  setProfileError();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('maria_gomez')).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
