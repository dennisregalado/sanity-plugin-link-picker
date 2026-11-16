import path from 'node:path'

import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET,
  },
  vite: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        // Develop against the plugin source rather than the built package
        'sanity-plugin-link-picker': path.resolve(__dirname, '../src/index.ts'),
      },
    },
    server: {...config.server, fs: {allow: [path.resolve(__dirname, '..')]}},
  }),
})
