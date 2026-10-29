import path from 'node:path'
import { Config } from '@remotion/cli/config'
import { enableTailwind } from '@remotion/tailwind-v4'

Config.setEntryPoint('src/film/index.ts')

Config.overrideWebpackConfig((config) => {
  const withTailwind = enableTailwind(config)
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: { ...withTailwind.resolve?.alias, '@': path.join(process.cwd(), 'src') },
    },
  }
})
