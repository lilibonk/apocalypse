import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Playwright1.63's automatic error page snapshot may include private form values.
// Verified installed runner's _takePageSnapshot honors this process-scoped opt-out.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

const checkpoint = process.env.APOCALYPSE_BROWSER_CHECKPOINT
  ? (JSON.parse(readFileSync(process.env.APOCALYPSE_BROWSER_CHECKPOINT, 'utf8')) as {
      origin: string
      chromiumSpkiSha256: string
    })
  : undefined
const integrationOrigin = process.env.APOCALYPSE_BROWSER_BASE_URL ?? checkpoint?.origin
const integrationSpki = process.env.APOCALYPSE_BROWSER_TLS_SPKI ?? checkpoint?.chromiumSpkiSha256
if (process.argv.some((arg) => arg === '--project=integration') && !integrationOrigin)
  throw new Error('Browser integration requires a live HTTPS deployment checkpoint')
if (integrationOrigin) {
  const url = new URL(integrationOrigin)
  if (url.protocol !== 'https:') throw new Error('Browser integration requires HTTPS')
  if (
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    !/^[A-Za-z0-9+/]{43}=$/.test(integrationSpki ?? '')
  )
    throw new Error('Loopback HTTPS integration requires the temporary certificate SPKI pin')
}
const localOrigin = 'http://127.0.0.1:4317'
export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: path.resolve(
    import.meta.dirname,
    '../.verify/scaffold-release/optimization-20260930/frontend/playwright-output',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: path.resolve(
          import.meta.dirname,
          '../.verify/scaffold-release/optimization-20260930/frontend/browser-results.json',
        ),
      },
    ],
  ],
  use: {
    ...devices['Desktop Chrome'],
    // Auth integration artifacts must never capture cookies, access tokens or passwords.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'fixtures', testMatch: '**/*.browser.spec.ts', use: { baseURL: localOrigin } },
    {
      name: 'integration',
      testMatch: '**/*.integration.spec.ts',
      use: {
        baseURL: integrationOrigin,
        ignoreHTTPSErrors: false,
        launchOptions: integrationSpki
          ? { args: [`--ignore-certificate-errors-spki-list=${integrationSpki}`] }
          : {},
      },
    },
  ],
  webServer: integrationOrigin
    ? undefined
    : {
        command: 'pnpm dev --host 127.0.0.1 --port 4317 --strictPort',
        url: `${localOrigin}/test-fixtures/module-lifecycle.html`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
})
