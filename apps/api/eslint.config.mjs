import tseslint from 'typescript-eslint'

export default tseslint.config(...tseslint.configs.recommended, {
  files: ['src/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '**/db/**',
              '**/repositories/**',
              '**/services/**',
              '**/providers/**',
              '**/routes/**',
              '**/workflows/**',
              'drizzle-orm*',
              'better-auth*',
              'hono*',
              'cloudflare:*',
            ],
            message: 'domain/ imports from no other layer.',
          },
        ],
      },
    ],
  },
})
