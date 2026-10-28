// Installs Playwright's Chromium inside node_modules (ADR-11), so nothing is installed globally.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('node_modules/@playwright/test')) {
  console.log('Playwright not installed yet; skipping browser download.');
  process.exit(0);
}

const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
});
process.exit(result.status ?? 1);
