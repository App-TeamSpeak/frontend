import { expect, test, type Page, type TestInfo } from '@playwright/test';

const room = {
  roomId: 'synthetic-room-id',
  ownerId: 'us06-owner',
  name: 'Cálculo II',
  createdAt: '2026-11-18T20:00:00.000Z',
  participants: 1,
  connected: 1,
};

const responsiveSizes: Array<[number, number]> = [
  [768, 1024],
  [800, 600],
  [800, 360],
  [320, 640],
];

async function stubAuthAndRooms(page: Page, initialRooms: unknown[] = [room], failListInitially = false) {
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const firebaseAuth = { currentUser: { uid: 'us06-owner', emailVerified: true,
        providerData: [{ providerId: 'password' }],
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
        let signedIn = true;
        const identityObj = { uid: 'us06-owner', emailVerified: true,
          providerData: [{ providerId: 'password' }],
          getIdToken: async () => 'synthetic-room-token' };
        export const configureAuth = async () => {};
        export const currentFirebaseUser = () => signedIn ? identityObj : null;
        export const logoutUser = async () => {
          signedIn = false;
          window.dispatchEvent(new Event('teamspeak-test-logout'));
        };
        export const subscribeToAuth = callback => {
          callback({ id: 'us06-owner', name: 'María', apellido: 'Gómez', username: 'maria_gomez',
            emailVerified: true, email: 'maria@example.test', avatarUrl: null, canChangeEmail: true });
          const onLogout = () => callback(null);
          window.addEventListener('teamspeak-test-logout', onLogout);
          return () => window.removeEventListener('teamspeak-test-logout', onLogout);
        };`,
    });
  });

  let listShouldFail = failListInitially;
  let patchCalls = 0;
  let deleteCalls = 0;
  let postCalls = 0;

  await page.route('**/api/rooms', async route => {
    if (route.request().method() === 'GET') {
      if (listShouldFail) {
        await route.fulfill({
          status: 503,
          json: { success: false, code: 'FIRESTORE_UNAVAILABLE', message: 'Error' },
        });
        return;
      }
      await route.fulfill({ json: { success: true, data: initialRooms } });
      return;
    }
    postCalls++;
    await route.fulfill({ status: 201, json: { success: true, data: room } });
  });

  await page.route(`**/api/rooms/${room.roomId}`, async route => {
    const method = route.request().method();
    if (method === 'PATCH') patchCalls++;
    if (method === 'DELETE') deleteCalls++;
    await route.fulfill({ json: { success: true, data: room } });
  });

  await page.route('**/api/users/me', async route => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { success: true, data: { status: 'completed' } } });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          uid: 'us06-owner',
          profileStatus: 'complete',
          profile: {
            uid: 'us06-owner',
            nombre: 'María',
            apellido: 'Gómez',
            username: 'maria_gomez',
            email: 'maria@example.test',
            avatarUrl: null,
          },
        },
      },
    });
  });

  return {
    enableList: () => { listShouldFail = false; },
    getCounts: () => ({ patchCalls, deleteCalls, postCalls }),
  };
}

test('FASE A: completa Error parcial de Dashboard y cancelaciones/salidas de salas sin mutaciones', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const base = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(base);
  const tracker = await stubAuthAndRooms(page, [room], true);

  // 1. Dashboard Error parcial: falla GET inicial, se crea una sala desde el modal y permanece la tarjeta con el aviso parcial
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toContainText('El servicio no está disponible');
  await page.getByRole('button', { name: '＋ Crear sala' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Crear sala', exact: true });
  await createDialog.getByLabel('Nombre de la sala').fill('Cálculo II');
  await createDialog.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page.getByRole('heading', { name: 'Sala creada correctamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir a mis salas' }).click();
  await expect(page.getByRole('heading', { name: 'Cálculo II' })).toBeVisible();
  const partialNotice = page.getByRole('status').filter({ hasText: 'No pudimos actualizar el listado completo.' });
  await expect(partialNotice).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(base.width);
  await page.screenshot({ path: info.outputPath('dashboard-error-parcial.png'), scale: 'css' });

  // Reintentar limpia el aviso parcial y conserva la sala
  tracker.enableList();
  await partialNotice.getByRole('button', { name: 'Reintentar' }).click();
  await expect(partialNotice).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cálculo II' })).toBeVisible();

  // 2. Crear sala -> Salir del formulario sin enviar POST
  const postsBeforeCancel = tracker.getCounts().postCalls;
  await page.goto('/salas/crear');
  await page.getByLabel('Nombre de la sala').fill('Borrador cancelado');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Tus salas' })).toBeVisible();
  expect(tracker.getCounts().postCalls).toBe(postsBeforeCancel);
  await page.screenshot({ path: info.outputPath('crear-salir-formulario.png'), scale: 'css' });

  // 3. Editar sala -> Cancelación sin enviar PATCH
  await page.getByRole('button', { name: 'Más opciones de Cálculo II' }).click();
  await page.getByRole('menuitem', { name: 'Editar sala' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar sala' });
  await edit.getByLabel('Nombre de la sala').fill('Nombre no guardado');
  await edit.getByRole('button', { name: 'Cancelar' }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cálculo II' })).toBeVisible();
  expect(tracker.getCounts().patchCalls).toBe(0);
  await page.screenshot({ path: info.outputPath('editar-sala-cancelacion.png'), scale: 'css' });

  // 4. Eliminar sala -> Cancelación sin enviar DELETE
  await page.getByRole('button', { name: 'Más opciones de Cálculo II' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar sala' }).click();
  const remove = page.getByRole('dialog', { name: '¿Eliminar esta sala?' });
  await remove.getByRole('button', { name: 'Cancelar' }).click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cálculo II' })).toBeVisible();
  expect(tracker.getCounts().deleteCalls).toBe(0);
  await page.screenshot({ path: info.outputPath('eliminar-sala-cancelacion.png'), scale: 'css' });
});

test('FASE C: reproduce Fallo de navegación tras eliminación completada en navegador', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  const base = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(base);
  await stubAuthAndRooms(page);

  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByRole('checkbox').check();

  // Simula fallo de navegación SPA tras cerrar sesión local hasta que el usuario reintente
  await page.evaluate(() => {
    const origReplace = window.history.replaceState.bind(window.history);
    (window as unknown as { __restoreReplaceState: () => void }).__restoreReplaceState = () => {
      window.history.replaceState = origReplace;
    };
    window.history.replaceState = () => {
      throw new Error('Navegación bloqueada sintéticamente');
    };
  });

  await dialog.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(dialog.getByText('El servidor confirmó la eliminación de tu cuenta.')).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('no pudimos abrir el inicio de sesión');
  const retryNav = dialog.getByRole('button', { name: 'Ir al inicio de sesión' });
  await expect(retryNav).toBeVisible();
  await page.screenshot({ path: info.outputPath('us05-fallo-navegacion.png'), scale: 'css' });

  await page.evaluate(() => {
    (window as unknown as { __restoreReplaceState?: () => void }).__restoreReplaceState?.();
  });
  await retryNav.click();
  await expect(page).toHaveURL(/\/login$/);
});

test('FASE D: verificación responsive representativa en 768×1024, 800×600, 800×360 y 320×640', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('mobile'), 'Las resoluciones adicionales se ejecutan en el proyecto de escritorio');

  async function checkViewport(width: number, height: number, stem: string, locatorToCheck?: ReturnType<Page['locator']>) {
    await page.setViewportSize({ width, height });
    if (locatorToCheck) {
      await locatorToCheck.scrollIntoViewIfNeeded();
      await expect(locatorToCheck).toBeInViewport();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(overflow).toBe(true);
    await page.screenshot({ path: info.outputPath(`${stem}-${width}x${height}.png`), scale: 'css' });
  }

  // 1. Rutas públicas de Autenticación
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const firebaseAuth = { currentUser: null };
        export const firebaseApp = {};
        export const assertFirebaseConfiguration = () => {};`,
    }),
  );
  await page.route(/\/src\/services\/auth\.ts(\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('real')) { await route.continue(); return; }
    url.searchParams.set('real', '1');
    await route.fulfill({
      contentType: 'application/javascript',
      body: `export * from ${JSON.stringify(url.pathname + url.search)};
        export const configureAuth = async () => {};
        export const subscribeToAuth = cb => { cb(null); return () => {}; };`,
    });
  });

  await page.goto('/login');
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-auth-login', page.getByRole('button', { name: 'Ingresar' }));
  }

  await page.goto('/registro');
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-auth-registro', page.getByRole('button', { name: 'Crear cuenta' }));
  }

  // 2. Perfil, Eliminación, Dashboard y Modales de salas
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await stubAuthAndRooms(page, [room], false);

  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us04-perfil', page.getByRole('button', { name: 'Editar perfil' }));
  }

  await page.getByRole('button', { name: 'Editar perfil' }).click();
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us04-editar', page.getByRole('button', { name: 'Guardar cambios' }));
  }

  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await deleteDialog.getByRole('checkbox').check();
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us05-confirmacion', deleteDialog.getByRole('button', { name: 'Eliminar mi cuenta' }));
  }
  await deleteDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Cálculo II' })).toBeVisible();
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us06-dashboard', page.getByRole('button', { name: '＋ Crear sala' }));
  }

  await page.getByRole('button', { name: '＋ Crear sala' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Crear sala' });
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us06-crear', createDialog.getByRole('button', { name: 'Crear sala' }));
  }
  await createDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: '＋ Unirse a sala' }).click();
  const joinDialog = page.getByRole('dialog', { name: 'Unirse a sala' });
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us06-unirse', joinDialog.getByRole('button', { name: 'Unirse a la sala' }));
  }
  await joinDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Más opciones de Cálculo II' }).click();
  await page.getByRole('menuitem', { name: 'Editar sala' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar sala' });
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us06-editar', editDialog.getByRole('button', { name: 'Guardar cambios' }));
  }
  await editDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Más opciones de Cálculo II' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar sala' }).click();
  const removeDialog = page.getByRole('dialog', { name: '¿Eliminar esta sala?' });
  for (const [w, h] of responsiveSizes) {
    await checkViewport(w, h, 'resp-us06-eliminar', removeDialog.getByRole('button', { name: 'Eliminar sala' }));
  }
  await removeDialog.getByRole('button', { name: 'Cancelar' }).click();
});
