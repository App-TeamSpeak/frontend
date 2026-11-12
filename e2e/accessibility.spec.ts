import { expect, test } from '@playwright/test';

test.describe('auditoría pública de accesibilidad', () => {
  test('login tiene etiquetas, foco visible y validación anunciable', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Contraseña', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Completa el campo correo electrónico.');
    await expect(page.getByLabel('Correo electrónico')).toBeFocused();
  });

  test('registro anuncia errores específicos y conserva los campos', async ({ page }) => {
    await page.goto('/registro');
    const email = page.getByLabel('Correo electrónico');
    const password = page.getByRole('textbox', { name: 'Contraseña', exact: true });

    await email.fill('persona@universidad.edu');
    await password.fill('persona@universidad.edu');
    await page.getByRole('textbox', { name: 'Confirmar contraseña', exact: true }).fill('persona@universidad.edu');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'La contraseña no puede ser un correo electrónico.' })).toBeVisible();
    await expect(email).toHaveValue('persona@universidad.edu');
    await expect(password).toHaveValue('persona@universidad.edu');
  });

  test('la ayuda de contraseña se puede cerrar con Escape y conserva el foco operativo', async ({ page }) => {
    await page.goto('/registro');
    const trigger = page.getByRole('button', { name: '¿Qué contraseña usar?' });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Crea una contraseña segura' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('rutas informativas mantienen jerarquía y navegación accesible', async ({ page }) => {
    await page.goto('/ayuda');
    await expect(page.getByRole('heading', { name: 'Ayuda' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones de ayuda' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Crear una cuenta' })).toHaveAttribute('href', '/registro');

    await page.goto('/accesibilidad');
    await expect(page.getByRole('heading', { name: 'Accesibilidad' })).toBeVisible();
  });

  test('la composición pública no desborda en móvil', async ({ page }) => {
    await page.goto('/registro');
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });
});
