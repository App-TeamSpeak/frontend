import { expect, test, type Page } from '@playwright/test';

const initial = {
  uid: 'us04-test', nombre: 'María', apellido: 'Gómez', username: 'maria_gomez',
  usernameKey: 'maria_gomez', email: 'maria@example.test', avatarUrl: null,
  profileStatus: 'complete', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

async function stubProfile(page: Page, missingUsername = false, pendingOutcome?: 'success' | 'failure', passwordLinked: boolean | 'both' = false, simulateEmailVerification = false) {
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
      emailVerified: true, providerData: ${JSON.stringify(passwordLinked === 'both' ? [{ providerId: 'password' }, { providerId: 'google.com' }] : passwordLinked ? [{ providerId: 'password' }] : [])}, getIdToken: async () => 'synthetic-id-token' } };
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
      ${simulateEmailVerification ? `
        let confirmedEmail;
        let sendCount = 0;
        export const requestVerifiedEmailChange = async (_uid, email, _signal, password, sending) => {
          if (email === 'recuperacion@example.test') {
            if (!password) throw Object.assign(new Error('Reautentícate.'), { code: 'AUTH_RECENT_REQUIRED' });
            if (password !== 'fixture-password') throw new Error('La contraseña actual es incorrecta.');
            if (++sendCount === 2) throw new Error('Espera unos minutos e inténtalo de nuevo.');
          }
          await window.releaseEmailEligibility();
          sending();
          await window.releaseEmailDelivery();
          confirmedEmail = email;
        };
        export const confirmVerifiedEmailChange = async () => {
          if (!await window.releaseEmailCheck()) return null;
          const profile = { ...${JSON.stringify(initial)}, email: confirmedEmail };
          return { profile, user: { id: profile.uid, name: profile.nombre, apellido: profile.apellido,
            username: profile.username, email: profile.email, emailVerified: true, canChangeEmail: true }, isCurrent: () => true };
        };` : ''}
      ${passwordLinked === 'both' ? `
        export const reauthenticateForDeletion = async (_identity, provider, password) => {
          const message = await window.deletionReauth(provider, password);
          if (message) throw new Error(message);
        };` : ''}
      export const logoutUser = async () => {
        await window.deletionLogout?.();
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
  if (!mobile) {
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      const save = main.getByRole('button', { name: 'Guardar cambios' });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: info.outputPath(`editar-${width}x${height}.png`), scale: 'css' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
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
    await expect(page.getByRole('main').getByRole('status')).toContainText('Guardando cambios…');
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

test('US-05 confirma y cancela desde el perfil sin enviar DELETE ni cerrar sesión', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  const deletions: string[] = [];
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    deletions.push(route.request().url());
    await route.abort();
  });
  await page.goto('/perfil');
  if (!mobile) await expect(page.getByRole('heading', { name: 'Configuración de cuenta' })).toBeVisible();
  const entry = page.getByRole('button', { name: 'Eliminar cuenta', exact: true });
  await entry.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  const cancel = dialog.getByRole('button', { name: 'Cancelar' });
  const check = dialog.getByRole('checkbox', { name: /Entiendo las consecuencias/ });
  const destructive = dialog.getByRole('button', { name: 'Eliminar mi cuenta' });
  await expect(dialog).toHaveAccessibleDescription(/Esta acción es definitiva/);
  await expect(cancel).toBeFocused();
  await expect(check).not.toBeChecked();
  await expect(destructive).toBeDisabled();
  await page.screenshot({ path: info.outputPath('us05-confirmacion.png'), scale: 'css' });
  await page.keyboard.press('Shift+Tab');
  await expect(check).toBeFocused();
  await page.keyboard.press('Space');
  await expect(check).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await expect(destructive).toBeEnabled();
  await page.screenshot({ path: info.outputPath('us05-confirmacion-marcada.png'), scale: 'css' });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeFocused();
  await expect(page.getByText(initial.email)).toBeVisible();
  await entry.click();
  await expect(check).not.toBeChecked();
  await cancel.click();
  await expect(entry).toBeFocused();

  await page.screenshot({ path: info.outputPath('us05-cancelada.png'), scale: 'css' });

  await entry.click();
  await check.check();
  await page.evaluate(() => window.dispatchEvent(new Event('teamspeak-test-switch')));
  await expect(page.getByText('second@example.test')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await entry.click();
  await expect(check).not.toBeChecked();
  await check.check();
  await expect(destructive).toBeEnabled();
  await cancel.click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByText('second@example.test')).toBeVisible();
  expect(deletions).toEqual([]);
});

test('US-04 ofrece completar un perfil incompleto', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubProfile(page, true);
  await page.route('**/api/users/me', route => route.fulfill({
    json: { success: true, data: { uid: initial.uid, profileStatus: 'incomplete', profile: null } },
  }));
  await page.goto('/perfil');
  await expect(page.getByRole('link', { name: 'Completar perfil' })).toHaveAttribute('href', '/completar-username');
  await expect(page.getByRole('button', { name: 'Editar perfil' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('perfil-incompleto.png'), scale: 'css' });
});

test('US-04 previsualiza, aplica y guarda un avatar HTTPS', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const size = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(size);
  const { enableLoad, releaseSave, patches } = await stubProfile(page, false, 'success');
  enableLoad();
  releaseSave();
  const photo = 'https://images.example.test/avatar.svg';
  await page.route(photo, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="86" height="86"><rect width="86" height="86" fill="#0f766e"/><circle cx="43" cy="33" r="12" fill="#f8fafc"/><ellipse cx="43" cy="65" rx="22" ry="13" fill="#f8fafc"/></svg>',
  }));
  await page.route('https://images.example.test/missing.png', route => route.fulfill({ status: 404 }));
  const capture = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`), scale: 'css' });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  const trigger = page.getByRole('button', { name: 'Cambiar foto' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar foto de perfil' });
  const input = dialog.getByLabel('Avatar HTTPS (opcional)');
  await expect(input).toBeFocused();
  await capture('avatar-selector');
  await input.fill('http://images.example.test/avatar.svg');
  await dialog.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await capture('avatar-validacion');
  await input.fill('https://images.example.test/missing.png');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('No pudimos cargar');
  await capture('avatar-error');
  await dialog.getByRole('button', { name: 'Volver' }).click();
  await expect(input).toBeFocused();
  await input.fill(photo);
  await input.press('Enter');
  const image = dialog.locator('.user-profile-avatar img');
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(86);
  await capture('avatar-previa');
  const apply = dialog.getByRole('button', { name: 'Usar esta foto' });
  if (!mobile) {
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await capture(`avatar-previa-${width}x${height}`);
    }
    await page.setViewportSize(size);
  }
  await apply.click();
  await expect(trigger).toBeFocused();
  expect(patches).toEqual([]);
  const avatar = page.locator('main .user-profile-identity img[src^="https:"]');
  await expect(avatar).toHaveAttribute('src', photo);
  await capture('avatar-aplicado');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  expect(patches).toEqual([{ avatarUrl: photo }]);
  await capture('avatar-guardado');
  await page.getByRole('button', { name: 'Volver al perfil' }).click();
  await expect(avatar).toHaveAttribute('src', photo);
  await capture('avatar-consulta');
});

test('US-04 valida el nuevo correo y conserva el borrador ante EMAIL_TAKEN', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad, patches } = await stubProfile(page, false, undefined, true);
  enableLoad();
  const attempts: unknown[] = [];
  await page.route('**/api/users/me/email-change', async route => {
    expect(route.request().method()).toBe('POST');
    attempts.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { success: false, code: 'EMAIL_TAKEN', message: 'El correo electrónico no está disponible.' } });
  });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Cambios sin guardar');
  const address = page.getByLabel('Nuevo correo electrónico');
  const send = page.getByRole('button', { name: 'Enviar verificación' });
  await address.fill('inválido');
  await send.click();
  await expect(page.getByRole('alert')).toContainText('Introduce un correo electrónico válido');
  expect(attempts).toEqual([]);
  await address.fill('ocupado@example.test');
  await send.click();
  await expect(page.getByRole('alert')).toContainText('El correo electrónico no está disponible');
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Cambios sin guardar');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue(initial.email);
  expect(attempts).toEqual([{ newEmail: 'ocupado@example.test' }]);
  expect(patches).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('us04-cambio-correo.png'), scale: 'css' });
  await page.getByRole('button', { name: 'Cancelar cambio de correo' }).click();
  await expect(address).toHaveValue('');
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Cambios sin guardar');
});

test('US-04 muestra verificación de correo pendiente, comprobación y confirmación', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad, patches } = await stubProfile(page, false, undefined, true, true);
  enableLoad();
  let finishEligibility!: () => void;
  let finishDelivery!: () => void;
  let confirm!: (verified: boolean) => void;
  const eligibility = new Promise<void>(resolve => { finishEligibility = resolve; });
  const delivery = new Promise<void>(resolve => { finishDelivery = resolve; });
  const verification = new Promise<boolean>(resolve => { confirm = resolve; });
  let checks = 0;
  await page.exposeFunction('releaseEmailEligibility', () => eligibility);
  await page.exposeFunction('releaseEmailDelivery', () => delivery);
  await page.exposeFunction('releaseEmailCheck', () => ++checks === 1 ? false : verification);
  const capture = (name: string) => page.screenshot({ path: info.outputPath(`email-${name}.png`), fullPage: true, scale: 'css' });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  const form = page.getByRole('region', { name: 'Cambiar correo electrónico' });
  const address = form.getByLabel('Nuevo correo electrónico');
  const send = form.getByRole('button', { name: 'Enviar verificación' });
  const save = page.getByRole('button', { name: 'Guardar cambios' });
  await expect(address).toHaveValue('');
  await capture('inicial');
  await send.click();
  await expect(form.getByRole('alert')).toContainText('Introduce un correo electrónico válido');
  await capture('vacio');
  await address.fill('inválido');
  await send.click();
  await expect(form.getByRole('alert')).toBeVisible();
  await capture('invalido');
  await address.fill('nuevo@example.test');
  await send.click();
  await expect(form.getByRole('status')).toHaveText('Validando disponibilidad…');
  await expect(save).toBeDisabled();
  await capture('elegibilidad');
  finishEligibility();
  await expect(form.getByRole('status')).toHaveText('Enviando verificación…');
  await capture('enviando');
  finishDelivery();
  await expect(form.getByText(/Verificación pendiente para/)).toBeVisible();
  await capture('pendiente');
  const check = form.getByRole('button', { name: 'Comprobar verificación' });
  await check.click();
  await expect(form.getByRole('status')).toHaveText('El cambio todavía está pendiente de verificación.');
  await capture('sin-verificar');
  await check.click();
  await expect(form.getByRole('status')).toHaveText('Comprobando verificación…');
  await capture('comprobando');
  confirm(true);
  await expect(form.getByRole('status')).toContainText('El correo nuevo fue verificado');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue('nuevo@example.test');
  expect(patches).toEqual([]);
  await capture('confirmado');

  await form.getByRole('button', { name: 'Cambiar otra dirección' }).click();
  await address.fill('recuperacion@example.test');
  await send.click();
  const password = form.getByLabel('Contraseña actual');
  await expect(password).toBeVisible();
  await capture('reautenticacion');
  await password.fill('otra-contraseña');
  await send.click();
  await expect(form.getByRole('alert')).toContainText('La contraseña actual es incorrecta.');
  await expect(password).toHaveValue('');
  await capture('contrasena-incorrecta');
  await password.fill('fixture-password');
  await send.click();
  await expect(check).toBeVisible();
  const resend = form.getByRole('button', { name: 'Enviar otra verificación' });
  await resend.click();
  await expect(password).toBeVisible();
  await password.fill('fixture-password');
  await resend.click();
  await expect(form.getByRole('alert')).toContainText('Espera unos minutos');
  await capture('error-temporal');
  await password.fill('fixture-password');
  await resend.click();
  await expect(form.getByRole('status')).toContainText('Se solicitó otra verificación');
  await capture('reenvio');
  if (!mobile) {
    const size = page.viewportSize()!;
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await check.scrollIntoViewIfNeeded();
      await expect(check).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await capture(`recuperacion-${width}x${height}`);
    }
    await page.setViewportSize(size);
  }
  await form.getByRole('button', { name: 'Salir del cambio de correo' }).click();
  await expect(form.getByRole('status')).toContainText('Los enlaces enviados anteriormente pueden seguir vigentes.');
  await capture('cancelado');
  await form.getByRole('button', { name: 'Abrir cambio de correo' }).click();
  await expect(address).toHaveValue('');
  expect(patches).toEqual([]);
});

test('US-05 espera la confirmación por token y vuelve al login tras un solo DELETE', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  let deletions = 0;
  let lookups = 0;
  let receipt: string;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    deletions++;
    expect(route.request().postData()).toBeNull();
    expect(route.request().headers().authorization).toBe('Bearer synthetic-id-token');
    receipt = route.request().headers()['x-deletion-status-token'];
    expect(receipt).toMatch(/^[A-Za-z0-9_-]{64}$/);
    await pending;
    await route.fulfill({ status: 202, json: { success: true, data: { status: 'pending' } } });
  });
  await page.route('**/api/users/me/deletion-status', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    lookups++;
    expect(route.request().headers()['x-deletion-status-token']).toBe(receipt);
    expect(route.request().headers().authorization).toBeUndefined();
    expect(new URL(route.request().url()).search).toBe('');
    await route.fulfill({ json: { success: true, data: { status: 'completed' } } });
  });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(dialog.getByText('Eliminando cuenta…')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('us05-procesando.png'), scale: 'css' });
  release();
  await expect(dialog.getByText(/eliminación aún está pendiente/)).toBeVisible();
  await expect(page).toHaveURL(/\/perfil$/);
  await page.screenshot({ path: info.outputPath('us05-pendiente.png'), scale: 'css' });
  await dialog.getByRole('button', { name: 'Consultar estado' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.auth-card').getByRole('status')).toHaveText('El servidor confirmó la eliminación de tu cuenta.');
  expect(deletions).toBe(1);
  expect(lookups).toBe(1);
  await expect(page.getByRole('button', { name: 'Ver seguimiento de eliminación' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('us05-completada.png'), scale: 'css' });
});

test('US-05 trata un 503 como incierto y conserva una salida segura sin reenviar', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  let deletions = 0;
  let lookups = 0;
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    deletions++;
    await route.fulfill({ status: 503, json: { success: false, code: 'AUTH_UNAVAILABLE', message: 'No disponible' } });
  });
  await page.route('**/api/users/me/deletion-status', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers()['x-deletion-status-token']).toMatch(/^[A-Za-z0-9_-]{64}$/);
    if (++lookups === 1) {
      await route.abort('connectionreset');
      return;
    }
    await route.fulfill({ json: { success: true, data: { status: 'blocked' } } });
  });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(dialog.getByText('El resultado de la eliminación sigue sin confirmarse.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('us05-incierta.png'), scale: 'css' });
  const check = dialog.getByRole('button', { name: 'Consultar estado' });
  await check.click();
  await expect(dialog.getByRole('alert')).toContainText('No pudimos comprobar el estado');
  await page.screenshot({ path: info.outputPath('us05-seguimiento-error.png'), scale: 'css' });
  await check.click();
  await expect(dialog.getByRole('alert')).toContainText('Contacta a soporte');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('us05-bloqueada.png'), scale: 'css' });
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByText(initial.email)).toBeVisible();
  expect(deletions).toBe(1);
  expect(lookups).toBe(2);
});

test('US-05 recupera una respuesta perdida tras recargar sin identidad Firebase', async ({ page }, info) => {
  await page.setViewportSize(info.project.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  let deletions = 0;
  let receipt: string;
  let releaseLookup!: () => void;
  const lookup = new Promise<void>(resolve => { releaseLookup = resolve; });
  let lookups = 0;
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    deletions++;
    receipt = route.request().headers()['x-deletion-status-token'];
    await route.abort('connectionreset');
  });
  await page.route('**/api/users/me/deletion-status', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    expect(route.request().headers()['x-deletion-status-token']).toBe(receipt);
    expect(route.request().headers().authorization).toBeUndefined();
    lookups++;
    await lookup;
    await route.fulfill({ json: { success: true, data: { status: 'completed' } } });
  });

  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();
  const confirm = dialog.getByRole('button', { name: 'Eliminar mi cuenta' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog.getByText(/el resultado de la eliminación sigue sin confirmarse/i)).toBeVisible();

  await page.screenshot({ path: info.outputPath('us05-red-perdida.png'), scale: 'css' });

  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const firebaseAuth = { currentUser: null }; export const firebaseApp = {}; export const assertFirebaseConfiguration = () => {};',
  }));
  await page.route(/\/src\/services\/auth\.ts(\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('real')) { await route.fallback(); return; }
    url.searchParams.set('real', '1');
    await route.fulfill({ contentType: 'application/javascript', body: `
      export * from ${JSON.stringify(url.pathname + url.search)};
      export const configureAuth = async () => {};
      export const subscribeToAuth = callback => { callback(null); return () => {}; };
    ` });
  });

  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Ver seguimiento de eliminación' })).toHaveCount(0);
  await expect.poll(() => lookups).toBe(1);
  await page.screenshot({ path: info.outputPath('us05-recuperacion.png'), scale: 'css' });
  releaseLookup();
  await expect(page.locator('.auth-card').getByRole('status')).toHaveText('El servidor confirmó la eliminación de tu cuenta.');
  expect(deletions).toBe(1);
  await page.screenshot({ path: info.outputPath('us05-recuperada.png'), scale: 'css' });
});

test('US-05 coloca el seguimiento bloqueado al pie de Información personal y solo en perfil', async ({ page }, info) => {
  await page.setViewportSize(info.project.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { setProfileError } = await stubProfile(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('teamspeak.deletion.receipt.us04-test', JSON.stringify({
      token: 'a'.repeat(64), phase: 'blocked',
    }));
  });
  setProfileError({ status: 403, code: 'ACCOUNT_DELETION_BLOCKED' });
  const tracking = page.getByRole('button', { name: 'Ver seguimiento de eliminación' });
  await page.goto('/perfil');
  const card = page.getByRole('region', { name: 'Información personal' });
  await expect(card.getByRole('alert')).toContainText('Tu cuenta no tiene acceso al perfil');
  await expect(card.getByRole('button', { name: 'Ver seguimiento de eliminación' })).toBeVisible();
  await expect(tracking).toHaveCount(1);
  const geometry = await card.evaluate(element => {
    const heading = element.querySelector('h2')!.getBoundingClientRect();
    const button = element.querySelector('.user-profile-tracking button')!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return { aligned: Math.abs(heading.left - button.left) < 1, contained: button.right <= bounds.right && button.bottom <= bounds.bottom };
  });
  expect(geometry).toEqual({ aligned: true, contained: true });
  await page.screenshot({ path: info.outputPath('us05-seguimiento.png'), scale: 'css' });
  await tracking.click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await expect(dialog.getByRole('alert')).toContainText('Contacta a soporte');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(tracking).toBeFocused();

  for (const [path, heading] of [['/dashboard', 'Tus salas'], ['/salas/crear', 'Crear sala'], ['/ayuda', 'Ayuda']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(tracking).toHaveCount(0);
  }
});

test('US-05 conserva la reautenticación dentro del diálogo de confirmación', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad } = await stubProfile(page, false, undefined, 'both');
  enableLoad();
  let release!: (result: string) => void;
  let deletions = 0;
  const verification = new Promise<string>(resolve => { release = resolve; });
  await page.exposeFunction('deletionReauth', (provider: string) => provider === 'password'
    ? 'La contraseña actual es incorrecta.' : verification);
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    deletions++;
    await route.fulfill({ status: 401, json: { success: false, code: 'AUTH_RECENT_REQUIRED', message: 'Reautentícate.' } });
  });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(dialog.getByLabel('Contraseña actual')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar con contraseña' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('us05-reautenticacion.png'), scale: 'css' });
  const password = dialog.getByLabel('Contraseña actual');
  await password.fill('fixture-password');
  await dialog.getByRole('button', { name: 'Confirmar con contraseña' }).click();
  await expect(dialog.getByRole('alert')).toContainText('La contraseña actual es incorrecta.');
  await expect(password).toHaveValue('');
  await page.screenshot({ path: info.outputPath('us05-credenciales.png'), scale: 'css' });
  await dialog.getByRole('button', { name: 'Reautenticar con Google' }).click();
  await expect(dialog.getByRole('status')).toContainText('Comprobando identidad…');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('us05-google-procesando.png'), scale: 'css' });
  release('La comprobación con Google se canceló.');
  await expect(dialog.getByRole('alert')).toContainText('La comprobación con Google se canceló.');
  await expect(dialog.getByRole('button', { name: 'Reautenticar con Google' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('us05-google-error.png'), scale: 'css' });
  expect(deletions).toBe(1);
});

test('US-05 permite volver a confirmar después de un rechazo explícito', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const size = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(size);
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  let requests = 0;
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    requests++;
    await route.fulfill({ status: 400, json: { success: false, code: 'VALIDATION_ERROR', message: 'No disponible' } });
  });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  const checkbox = dialog.getByRole('checkbox');
  const confirm = dialog.getByRole('button', { name: 'Eliminar mi cuenta' });
  await checkbox.check();
  await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('El servidor rechazó la solicitud');
  await expect(checkbox).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await page.screenshot({ path: info.outputPath('us05-error.png'), scale: 'css' });
  if (!mobile) {
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await checkbox.check();
      await confirm.scrollIntoViewIfNeeded();
      await expect(confirm).toBeInViewport();
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: info.outputPath(`us05-error-${width}x${height}.png`), scale: 'css' });
    }
  } else {
    await checkbox.check();
  }
  await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('El servidor rechazó la solicitud');
  expect(requests).toBe(2);
});

test('US-05 reintenta el cierre local sin otra solicitud DELETE', async ({ page }, info) => {
  await page.setViewportSize(info.project.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  let deletions = 0;
  let logouts = 0;
  let finish!: () => void;
  const pendingLogout = new Promise<void>(resolve => { finish = resolve; });
  await page.exposeFunction('deletionLogout', async () => {
    if (++logouts === 1) {
      await pendingLogout;
      throw new Error('Fallo sintético de cierre local');
    }
  });
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'DELETE') { await route.fallback(); return; }
    deletions++;
    await route.fulfill({ json: { success: true, data: { status: 'completed' } } });
  });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(dialog.getByText('Finalizando la sesión local…')).toBeVisible();
  await page.screenshot({ path: info.outputPath('us05-cierre-procesando.png'), scale: 'css' });
  finish();
  await expect(dialog.getByRole('alert')).toContainText('problema al cerrar la sesión');
  await expect(dialog.getByRole('button', { name: 'Eliminar mi cuenta' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('us05-cierre-error.png'), scale: 'css' });
  await dialog.getByRole('button', { name: 'Reintentar cierre de sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.auth-card').getByRole('status')).toContainText('El servidor confirmó');
  expect(deletions).toBe(1);
  expect(logouts).toBe(2);
});

test('Sprint 2 mantiene el perfil y el diálogo utilizables en una ventana intermedia y baja', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('mobile'), 'La ventana intermedia se comprueba en el proyecto de escritorio');
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/perfil');
  const card = page.getByRole('region', { name: 'Información personal' });
  await expect(card.getByRole('button', { name: 'Editar perfil' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(800);
  await page.screenshot({ path: info.outputPath('US04-perfil-consulta-800x600.png'), scale: 'css' });

  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  await page.setViewportSize({ width: 800, height: 360 });
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();
  const confirm = dialog.getByRole('button', { name: 'Eliminar mi cuenta' });
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm).toBeInViewport();
  await page.screenshot({ path: info.outputPath('US05-eliminacion-confirmacion-800x360.png'), scale: 'css' });
});

test('Fase 3 conserva la geometría visual del perfil y el diálogo de eliminación', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  const { enableLoad } = await stubProfile(page);
  enableLoad();
  await page.goto('/perfil');

  const card = page.getByRole('region', { name: 'Información personal' });
  const editButton = page.getByRole('button', { name: 'Editar perfil' });
  const deleteTrigger = page.getByRole('button', { name: 'Eliminar cuenta', exact: true });
  const avatar = page.locator('main .user-profile-avatar');
  await expect(editButton).toBeVisible();

  const [cardBox, editBox, deleteBox, avatarBox] = await Promise.all([
    card.boundingBox(),
    editButton.boundingBox(),
    deleteTrigger.boundingBox(),
    avatar.boundingBox(),
  ]);
  expect(cardBox).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(deleteBox).not.toBeNull();
  expect(avatarBox).not.toBeNull();

  if (mobile) {
    expect(Math.round(avatarBox!.width)).toBe(62);
    expect(Math.round(avatarBox!.height)).toBe(62);
    expect(editBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height - 100);
    expect(deleteBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height);
  } else {
    expect(Math.round(avatarBox!.width)).toBe(68);
    expect(Math.round(avatarBox!.height)).toBe(68);
    expect(editBox!.x).toBeGreaterThan(cardBox!.x + cardBox!.width);
    expect(deleteBox!.x).toBeGreaterThan(cardBox!.x + cardBox!.width);
  }

  await deleteTrigger.click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await expect(dialog).toBeVisible();
  const checkbox = dialog.getByRole('checkbox');
  const confirm = dialog.getByRole('button', { name: 'Eliminar mi cuenta' });
  expect(await confirm.evaluate(el => getComputedStyle(el).opacity)).toBe('0.46');
  const box = await checkbox.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(20);
  expect(Math.round(box!.height)).toBe(20);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
});
