// @ts-check
const { test, expect } = require('@playwright/test');

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Letterhome/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /send a letter/i }).first()).toBeVisible();
});

test('send form step 1 → step 2', async ({ page }) => {
  await page.goto('/send');
  await expect(page.getByRole('group')).toHaveAttribute('aria-label', 'Order form step 1 of 3');

  await page.fill('#s-name',    'Jane Doe');
  await page.fill('#s-street',  '123 Main Street');
  await page.fill('#s-city',    'Vancouver');
  await page.fill('#s-province','BC');
  await page.fill('#s-postal',  'V6B 1A1');
  await page.fill('#s-country', 'Canada');
  await page.fill('#r-name',    'John Smith');
  await page.fill('#r-street',  '456 Spring Garden Road');
  await page.fill('#r-city',    'Halifax');
  await page.selectOption('#r-province', { label: /Nova Scotia/ });
  await page.fill('#r-postal',  'B3H 2L6');
  await page.fill('#r-email',   'smoke@test.example');

  await page.click('button:has-text("Continue")');

  await expect(page.getByRole('group')).toHaveAttribute('aria-label', 'Order form step 2 of 3', { timeout: 5000 });
  await expect(page.locator('#letter-body')).toBeVisible();
});

test('track page is usable', async ({ page }) => {
  await page.goto('/track');
  await expect(page).toHaveTitle(/Track/i);
  await expect(page.getByRole('button', { name: /track order/i })).toBeVisible();
});

test('contact page form is present', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
});

test('404 page renders', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  await expect(page).toHaveTitle(/not found/i);
  await expect(page.getByRole('link', { name: /back to letterhome/i })).toBeVisible();
});
