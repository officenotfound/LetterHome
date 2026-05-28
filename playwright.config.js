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
    // Cloudflare WAF bypass — set SMOKE_BYPASS_TOKEN in GitHub secrets, then add a
    // Cloudflare WAF Custom Rule: if (http.request.headers["x-smoke-bypass"] eq TOKEN) → Skip
    extraHTTPHeaders: process.env.SMOKE_BYPASS_TOKEN
      ? { 'x-smoke-bypass': process.env.SMOKE_BYPASS_TOKEN }
      : {},
  },
});
