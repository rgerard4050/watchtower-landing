const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'deployed-preview.spec.js',
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.PREVIEW_URL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
});
