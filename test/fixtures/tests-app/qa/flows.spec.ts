import { test } from '@playwright/test';

test('opens a user from a variable URL', async ({ page }) => {
  await page.goto(`${process.env.APP_URL}/users/7`);
  await page.locator('[data-testid="counter-value"]').isVisible();
});
