import { expect, test, type Page } from '@playwright/test';

const e2eReady =
  Boolean(process.env.E2E_BASE_URL?.trim()) &&
  Boolean(process.env.E2E_USER_EMAIL?.trim()) &&
  Boolean(process.env.E2E_USER_PASSWORD?.trim());

const email = process.env.E2E_USER_EMAIL ?? '';
const password = process.env.E2E_USER_PASSWORD ?? '';

async function ensureLoggedIn(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const app = page.locator('#screen-app');
  const loginVisible = await page.locator('#screen-login').isVisible().catch(() => false);
  if (loginVisible) {
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('#login-submit').click();
  }
  await expect(app).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#screen-login')).toBeHidden();
}

test.describe('Flujo desplegado (login → panel → chat → resumen)', () => {
  test.beforeEach(({}, testInfo) => {
    if (!e2eReady) {
      testInfo.skip(true, 'Define E2E_BASE_URL, E2E_USER_EMAIL y E2E_USER_PASSWORD (ver .env.e2e.example)');
    }
  });

  test('login, totales del panel y respuesta del asistente a un ingreso coloquial', async ({ page }) => {
    await ensureLoggedIn(page);

    await expect(page.locator('#resumen-totales')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#resumen-list')).toBeVisible();

    await page.locator('#input').fill('tengo 1000 pesos disponibles para gastar');
    await page.locator('#send').click();

    const lastAssistant = page.locator('#log .msg.assistant').last();
    await expect(lastAssistant).toBeVisible({ timeout: 120_000 });
    await expect(lastAssistant).toContainText(/registrado|disponible|saldo|ingreso|✔/i);

    const resumen = page.locator('#resumen-totales');
    await expect(resumen).toContainText(/disponible|DISPONIBLE/i, { timeout: 60_000 });
  });
});
