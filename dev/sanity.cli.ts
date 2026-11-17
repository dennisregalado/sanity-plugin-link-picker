import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {defineCliConfig} from 'sanity/cli'

const root = path.dirname(fileURLToPath(import.meta.url))

// Develop against the plugin source rather than the built package
const pluginAlias = {
  find: 'sanity-plugin-link-picker',
  replacement: path.resolve(root, '../src/index.ts'),
}

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET,
  },
  vite: (config) => {
    const existing = config.resolve?.alias
    const aliases = Array.isArray(existing)
      ? existing
      : Object.entries(existing ?? {}).map(([find, replacement]) => ({find, replacement}))

    return {
      ...config,
      resolve: {...config.resolve, alias: [...aliases, pluginAlias]},
      server: {...config.server, fs: {allow: [path.resolve(root, '..')]}},
    }
  },
})
