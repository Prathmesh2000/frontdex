import { expect, test } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Users', () => {
  test('saves a user', async ({ page }) => {
    await page.goto(`${BASE}/users/42`);
    await expect(page.getByRole('heading', { name: 'User profile' })).toBeVisible();
    await page.getByPlaceholder('Email').fill('a@b.c');
    await page.getByRole('button', { name: 'Save user' }).click();
    await expect(page.getByText('Saved somewhere else')).toBeVisible();
  });

  test('counts on the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('counter-value')).toHaveText('1');
  });
});
