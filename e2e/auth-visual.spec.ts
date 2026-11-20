import { expect, test, type Page, type TestInfo } from '@playwright/test';

const identity = {
  id: 'synthetic-auth', name: 'Ana', apellido: 'Prueba', email: 'ana@example.test',
  avatarUrl: null, emailVerified: true,
};

type Reply = { user?: typeof identity & { username?: string }; error?: string; code?: string; emailVerified?: boolean };

async function stubAuth(page: Page, initial: typeof identity | null = null) {
  let reply: Reply = {};
  let wait: Promise<void> | undefined;
  let release: (() => void) | undefined;
  await page.exposeFunction('syntheticAuthReply', async () => {
    await wait;
    return reply;
  });
  await page.route(/\/src\/firebase\.ts(\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const firebaseAuth = { currentUser: {
      uid: ${JSON.stringify(identity.id)}, getIdToken: async () => 'synthetic-id-token',
    } }; export const firebaseApp = {}; export const assertFirebaseConfiguration = () => {};`,
  }));
  await page.route(/\/src\/services\/auth\.ts(\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('fixture-original')) { await route.continue(); return; }
    url.searchParams.set('fixture-original', '1');
    await route.fulfill({ contentType: 'application/javascript', body: `
      export * from ${JSON.stringify(url.pathname + url.search)};
      import { AuthError } from ${JSON.stringify(url.pathname + url.search)};
      async function result() {
        const response = await window.syntheticAuthReply();
        if (response.error) throw new AuthError(response.code ?? 'fixture/error', response.error);
        return response;
      }
      export const configureAuth = async () => {};
      export const subscribeToAuth = callback => { callback(${JSON.stringify(initial)}); return () => {}; };
      export const loginUser = result;
      export const registerUser = result;
      export const continueWithGoogle = result;
      export const completeProfile = result;
      export const refreshCurrentUser = result;
      export const resendVerification = result;
      export const resetPassword = result;
    ` });
  });
  await page.route('**/api/rooms', route => route.fulfill({ json: { success: true, data: [] } }));
  return {
    reply(next: Reply) { reply = next; },
    hold() { wait = new Promise(resolve => { release = resolve; }); },
    resume() { release?.(); wait = undefined; },
  };
}

async function capture(page: Page, info: TestInfo, state: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath(`${state}.png`), fullPage: true, animations: 'disabled', scale: 'css' });
  if (!info.project.name.endsWith('mobile') && !state.endsWith('redireccion')) {
    const viewport = page.viewportSize()!;
    for (const [width, height] of [[768, 1024], [800, 600], [800, 360], [320, 640]]) {
      await page.setViewportSize({ width, height });
      const card = page.locator('.auth-flow .auth-card');
      expect(await card.evaluate(element => ({
        fits: element.scrollWidth <= element.clientWidth,
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      }))).toEqual({ fits: true, pageFits: true });
      const action = state === 'registro-ayuda'
        ? page.getByRole('button', { name: 'Entendido' })
        : card.locator('.auth-submit:visible').first();
      if (await action.count()) {
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
      }
      if (state.endsWith('inicial') || state === 'google-procesando') {
        await page.screenshot({ path: info.outputPath(`${state}-${width}x${height}.png`), fullPage: true, animations: 'disabled', scale: 'css' });
      }
    }
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

async function verifyPasswordVisibility(page: Page, info: TestInfo, label: string, state: string) {
  const input = page.getByLabel(label, { exact: true });
  await page.getByRole('button', { name: `Mostrar ${label.toLowerCase()}`, exact: true }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await capture(page, info, state);
  await page.getByRole('button', { name: `Ocultar ${label.toLowerCase()}`, exact: true }).click();
  await expect(input).toHaveAttribute('type', 'password');
}

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(info.project.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
});

test('autenticación visual · ingreso y errores de acceso', async ({ page }, info) => {
  const auth = await stubAuth(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  const email = page.getByLabel('Correo electrónico', { exact: true });
  const password = page.getByLabel('Contraseña', { exact: true });
  const submit = page.getByRole('button', { name: 'Ingresar', exact: true });
  await capture(page, info, 'login-inicial');
  await submit.click();
  await expect(email).toBeFocused();
  await capture(page, info, 'login-vacio');
  await email.fill('correo-invalido');
  await submit.click();
  await expect(page.getByText('Introduce un correo electrónico válido.')).toBeVisible();
  await capture(page, info, 'login-correo-invalido');
  await email.fill(identity.email);
  await submit.click();
  await expect(password).toBeFocused();
  await capture(page, info, 'login-sin-contrasena');
  await password.fill('clave-sintetica');
  await capture(page, info, 'login-diligenciado');
  await verifyPasswordVisibility(page, info, 'Contraseña', 'login-contrasena-visible');
  auth.reply({ error: 'Verifica tu correo y contraseña.', code: 'auth/invalid-credential' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Verifica tu correo y contraseña.');
  await capture(page, info, 'login-credenciales');
  auth.reply({ error: 'El servicio no está disponible.' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('El servicio no está disponible.');
  await capture(page, info, 'login-error');
  auth.reply({ user: { ...identity, username: 'ana_prueba' } });
  auth.hold();
  await submit.click();
  await expect(page.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
  await capture(page, info, 'login-procesando');
  auth.resume();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Tus salas', exact: true })).toBeVisible();
  await capture(page, info, 'login-redireccion');
});

test('autenticación visual · registro, validaciones y verificación inicial', async ({ page }, info) => {
  const auth = await stubAuth(page);
  await page.goto('/registro');
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Crear cuenta', exact: true });
  const email = page.getByLabel('Correo electrónico', { exact: true });
  const password = page.getByLabel('Contraseña', { exact: true });
  const confirm = page.getByLabel('Confirmar contraseña', { exact: true });
  await capture(page, info, 'registro-inicial');
  await page.getByRole('button', { name: '¿Qué contraseña usar?' }).click();
  await expect(page.getByRole('dialog', { name: 'Crea una contraseña segura' })).toBeVisible();
  await capture(page, info, 'registro-ayuda');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await submit.click();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeFocused();
  await capture(page, info, 'registro-vacio');
  await page.getByLabel('Nombre', { exact: true }).fill(identity.name);
  await page.getByLabel('Apellido').fill(identity.apellido);
  await email.fill('invalido');
  await password.fill('123');
  await confirm.fill('diferente');
  await submit.click();
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await capture(page, info, 'registro-validacion');
  await email.fill(identity.email);
  await password.fill('clave-sintetica');
  await confirm.fill('clave-sintetica');
  await capture(page, info, 'registro-diligenciado');
  await verifyPasswordVisibility(page, info, 'Contraseña', 'registro-contrasena-visible');
  await verifyPasswordVisibility(page, info, 'Confirmar contraseña', 'registro-confirmacion-visible');
  auth.reply({ error: 'Este correo ya está registrado. Inicia sesión.', code: 'auth/email-already-in-use' });
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Este correo ya está registrado');
  await capture(page, info, 'registro-duplicado');
  auth.reply({ error: 'El servicio no está disponible.' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('El servicio no está disponible.');
  await capture(page, info, 'registro-error');
  auth.reply({ user: { ...identity, emailVerified: false } });
  auth.hold();
  await submit.click();
  await expect(page.getByRole('button', { name: 'Creando…' })).toBeDisabled();
  await capture(page, info, 'registro-procesando');
  auth.resume();
  await expect(page).toHaveURL(/\/verificar-correo$/);
  await expect(page.getByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
  await capture(page, info, 'registro-redireccion');
});

test('autenticación visual · Google pendiente, cancelado, error y redirección', async ({ page }, info) => {
  const auth = await stubAuth(page);
  await page.goto('/login');
  const google = page.getByRole('button', { name: 'Continuar con Google' });
  await expect(google).toBeVisible();
  await capture(page, info, 'google-inicio');
  auth.reply({ error: 'Popup cerrado', code: 'auth/popup-closed-by-user' });
  auth.hold();
  await google.click();
  await expect(page.getByRole('button', { name: 'Conectando…' })).toBeDisabled();
  await capture(page, info, 'google-procesando');
  auth.resume();
  await expect(page.getByRole('alert')).toContainText('Inicio con Google cancelado');
  await capture(page, info, 'google-cancelacion');
  auth.reply({ error: 'No pudimos conectar con Google.' });
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('alert')).toHaveText('No pudimos conectar con Google.');
  await capture(page, info, 'google-error');
  await page.getByRole('link', { name: 'Volver al ingreso' }).click();
  await expect(google).toBeVisible();
  auth.reply({ user: identity });
  await google.click();
  await expect(page).toHaveURL(/\/completar-username$/);
  await expect(page.getByRole('heading', { name: 'Elige tu nombre de usuario' })).toBeVisible();
  await capture(page, info, 'google-redireccion');
});

test('autenticación visual · completar nombre de usuario', async ({ page }, info) => {
  const auth = await stubAuth(page, identity);
  await page.goto('/completar-username');
  const input = page.getByLabel('Nombre de usuario');
  const submit = page.getByRole('button', { name: 'Guardar nombre' });
  await expect(input).toBeVisible();
  await capture(page, info, 'username-inicial');
  await submit.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page, info, 'username-vacio');
  await input.fill('ana.prueba');
  await submit.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page, info, 'username-invalido');
  await input.fill('ana_prueba');
  await capture(page, info, 'username-diligenciado');
  auth.reply({ error: 'Ese nombre de usuario está ocupado.' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Ese nombre de usuario está ocupado.');
  await capture(page, info, 'username-ocupado');
  auth.reply({ error: 'El servicio no está disponible.' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('El servicio no está disponible.');
  await capture(page, info, 'username-error');
  auth.reply({ user: { ...identity, username: 'ana_prueba' } });
  auth.hold();
  await submit.click();
  await expect(page.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await capture(page, info, 'username-procesando');
  auth.resume();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Tus salas', exact: true })).toBeVisible();
  await capture(page, info, 'username-redireccion');
});

test('autenticación visual · verificar correo y reenviar', async ({ page }, info) => {
  const auth = await stubAuth(page, { ...identity, emailVerified: false });
  await page.goto('/verificar-correo');
  const check = page.getByRole('button', { name: 'Ya verifiqué mi correo' });
  const resend = page.getByRole('button', { name: 'Reenviar correo' });
  await expect(check).toBeVisible();
  await capture(page, info, 'verificar-inicial');
  auth.reply({ emailVerified: false });
  auth.hold();
  await check.click();
  await expect(page.getByRole('button', { name: 'Comprobando…' })).toBeDisabled();
  await capture(page, info, 'verificar-procesando');
  auth.resume();
  await expect(page.getByRole('status')).toContainText('todavía no está verificado');
  await capture(page, info, 'verificar-pendiente');
  await resend.click();
  await expect(page.getByRole('status')).toContainText('Enviamos un nuevo correo');
  await capture(page, info, 'verificar-reenvio');
  auth.reply({ error: 'El servicio no está disponible.' });
  await resend.click();
  await expect(page.getByRole('status')).toHaveText('El servicio no está disponible.');
  await capture(page, info, 'verificar-error');
  auth.reply({ emailVerified: true });
  await check.click();
  await expect(page).toHaveURL(/\/completar-username$/);
  await expect(page.getByRole('heading', { name: 'Elige tu nombre de usuario' })).toBeVisible();
  await capture(page, info, 'verificar-redireccion');
});

test('autenticación visual · recuperación de contraseña', async ({ page }, info) => {
  const auth = await stubAuth(page);
  await page.goto('/recuperar-contrasena');
  const email = page.getByLabel('Correo electrónico');
  const submit = page.getByRole('button', { name: 'Enviar enlace' });
  await expect(email).toBeVisible();
  await capture(page, info, 'recuperar-inicial');
  await submit.click();
  await expect(email).toBeFocused();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await capture(page, info, 'recuperar-validacion');
  await email.fill('correo-invalido');
  await submit.click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
  await email.fill(identity.email);
  auth.reply({ error: 'El servicio no está disponible.' });
  await submit.click();
  await expect(page.getByRole('status')).toHaveText('El servicio no está disponible.');
  await capture(page, info, 'recuperar-error');
  auth.reply({});
  auth.hold();
  await submit.click();
  await expect(page.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
  await capture(page, info, 'recuperar-procesando');
  auth.resume();
  await expect(page.getByRole('status')).toContainText('recibirás instrucciones');
  await capture(page, info, 'recuperar-exito');
});

test('autenticación visual · una sesión existente redirige desde ingreso', async ({ page }, info) => {
  await stubAuth(page, { ...identity, username: 'ana_prueba' });
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Tus salas', exact: true })).toBeVisible();
  await capture(page, info, 'login-sesion-redireccion');
});
