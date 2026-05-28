const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testMatch: 'tests/smoke.spec.js',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'https://letterhome.ca',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
