import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            KEY_ENCRYPTION_SECRET: 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
            BETTER_AUTH_SECRET: 'test-only-secret-not-used-outside-vitest',
            BETTER_AUTH_URL: 'https://example.com',
            RESEND_API_KEY: 'test-only-key',
            MAIL_FROM: 'Whence <mail@example.test>',
            POSTHOG_KEY: '',
          },
          outboundService: (request) =>
            new URL(request.url).hostname === 'api.resend.com'
              ? Response.json({ id: 'test-email' })
              : fetch(request),
        },
      }),
    ],
    test: { setupFiles: ['./src/test/setup.ts'], restoreMocks: true },
  }
})
