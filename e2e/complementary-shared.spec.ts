import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

async function stubCustomizableAuth(page: Page) {
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const firebaseAuth = { currentUser: { uid: 'u-shared', emailVerified: true,
        getIdToken: async () => 'synthetic-shared-token' } };
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
          window.__authCallback = callback;
          const mode = sessionStorage.getItem('__test_auth_mode') || 'none';
          if (mode === 'loading') {
            return () => {};
          }
          if (mode === 'none') {
            callback(null);
          } else if (mode === 'unverified') {
            callback({ id: 'u-shared', name: 'María', apellido: 'Gómez', username: 'maria_gomez',
              emailVerified: false, email: 'maria@example.test', avatarUrl: null });
          } else if (mode === 'incomplete') {
            callback({ id: 'u-shared', name: 'María', apellido: 'Gómez', username: '',
              emailVerified: true, email: 'maria@example.test', avatarUrl: null });
          } else if (mode === 'authenticated') {
            callback({ id: 'u-shared', name: 'María', apellido: 'Gómez', username: 'maria_gomez',
              emailVerified: true, email: 'maria@example.test', avatarUrl: null });
          }
          return () => {};
        };
        export const logoutUser = async () => {
          const behavior = window.__logoutBehavior || 'immediate';
          if (behavior === 'hold') {
            await new Promise((resolve, reject) => {
              window.__resolveLogout = resolve;
              window.__rejectLogout = reject;
            });
          } else if (behavior === 'error') {
            throw new Error('No pudimos cerrar tu sesión.');
          }
        };
      `,
    });
  });
  await page.route('**/api/rooms', route =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            roomId: 'room-calc-02',
            ownerId: 'u-shared',
            name: 'Cálculo II - Grupo A',
            createdAt: '2026-11-18T20:00:00.000Z',
            participants: 3,
            connected: 3,
          },
        ],
      },
    }),
  );
  await page.route('**/api/rooms/room-calc-02', route =>
    route.fulfill({
      json: {
        success: true,
        data: {
          roomId: 'room-calc-02',
          ownerId: 'u-shared',
          name: 'Cálculo II - Grupo A',
          createdAt: '2026-11-18T20:00:00.000Z',
          participants: 3,
          connected: 3,
        },
      },
    }),
  );
  await page.route('**/api/rooms/room-calc-02/messages', route =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/users/me', route =>
    route.fulfill({
      json: {
        success: true,
        data: {
          uid: 'u-shared',
          profileStatus: 'complete',
          profile: {
            uid: 'u-shared',
            nombre: 'María',
            apellido: 'Gómez',
            username: 'maria_gomez',
            usernameKey: 'maria_gomez',
            email: 'maria@example.test',
            avatarUrl: null,
          },
        },
      },
    }),
  );
}

test('pantallas complementarias: redirección inicial, ayuda, accesibilidad, sesión cerrada y 404', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubCustomizableAuth(page);

  // 1. Redirección inicial (/) -> /login
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-redireccion-inicial');

  // 2. Ayuda (/ayuda) y Cabecera pública
  await page.goto('/ayuda');
  await expect(page.getByRole('heading', { name: 'Ayuda', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Secciones de ayuda' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-ayuda');
  await captureAllViewports(page, info, mobile, 'comp-cabecera-publica');

  // 3. Accesibilidad (/accesibilidad) y Pie de página
  await page.goto('/accesibilidad');
  await expect(page.getByRole('heading', { name: 'Accesibilidad', exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('TeamSpeak · Estudia mejor, en compañía.');
  await captureAllViewports(page, info, mobile, 'comp-accesibilidad');
  await captureAllViewports(page, info, mobile, 'comp-pie-pagina');

  // 4. Cierre de sesión exitoso (/sesion-cerrada)
  await page.goto('/sesion-cerrada');
  await expect(page.getByRole('heading', { name: 'Sesión cerrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al ingreso' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-sesion-cerrada');

  // 5. Página 404 (*)
  await page.goto('/ruta-inexistente-404');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al ingreso' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-404');
});

test('componentes compartidos: protecciones de ruta, estados de carga y redirecciones', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubCustomizableAuth(page);

  // 1. Cargando sesión
  await page.goto('/login');
  await page.evaluate(() => sessionStorage.setItem('__test_auth_mode', 'loading'));
  await page.goto('/dashboard');
  await expect(page.getByRole('status')).toContainText('Cargando sesión…');
  await captureAllViewports(page, info, mobile, 'comp-cargando-sesion');

  // 2. Redirección por falta de sesión
  await page.evaluate(() => sessionStorage.setItem('__test_auth_mode', 'none'));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await captureAllViewports(page, info, mobile, 'comp-redireccion-sin-sesion');

  // 3. Redirección por correo no verificado
  await page.evaluate(() => sessionStorage.setItem('__test_auth_mode', 'unverified'));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/verificar-correo$/);
  await expect(page.getByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-redireccion-no-verificado');

  // 4. Redirección por perfil incompleto
  await page.evaluate(() => sessionStorage.setItem('__test_auth_mode', 'incomplete'));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/completar-username$/);
  await expect(page.getByRole('heading', { name: 'Elige tu nombre de usuario' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-redireccion-perfil-incompleto');
});

test('componentes compartidos: cabecera autenticada, acceso desde avatar, cabecera de sala y flujo de cierre de sesión', async ({ page }, info) => {
  const mobile = info.project.name.endsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await stubCustomizableAuth(page);

  await page.goto('/login');
  await page.evaluate(() => sessionStorage.setItem('__test_auth_mode', 'authenticated'));

  // 1. Cabecera autenticada en /ayuda
  await page.goto('/ayuda');
  await expect(page.getByRole('navigation', { name: 'Navegación del panel' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Perfil', exact: true })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-cabecera-autenticada');

  // 2. Acceso desde avatar -> /perfil
  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-acceso-avatar');

  // 3.Confirmación de salida, Cerrando sesión y Error de cierre desde /dashboard
  await page.getByRole('navigation', { name: 'Navegación del panel' }).getByRole('link', { name: 'Mis salas' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Tus salas' })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __logoutBehavior: string }).__logoutBehavior = 'hold';
  });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('dialog', { name: '¿Cerrar sesión?' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-confirmacion-salida');

  await page.getByRole('dialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('dialog', { name: 'Cerrando sesión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrando sesión…' })).toBeDisabled();
  await captureAllViewports(page, info, mobile, 'comp-cerrando-sesion');

  await page.evaluate(() => {
    (window as unknown as { __rejectLogout?: (err: Error) => void }).__rejectLogout?.(new Error('Fallo de red'));
  });
  await expect(page.getByRole('dialog', { name: 'No pudimos cerrar tu sesión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-error-cierre');
  await page.getByRole('button', { name: 'Volver a mis salas' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 4. Cabecera de sala (/salas/room-calc-02)
  await page.goto('/salas/room-calc-02');
  await expect(page.getByRole('heading', { name: 'Cálculo II - Grupo A' })).toBeVisible();
  await captureAllViewports(page, info, mobile, 'comp-cabecera-sala');
});
