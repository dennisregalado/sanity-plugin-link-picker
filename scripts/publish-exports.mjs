/**
 * pkg-utils keeps a `source` condition (pointing at src/) in package.json `exports` for local
 * development, and the exports to publish in `publishConfig.exports`. pnpm swaps these when
 * publishing; npm doesn't. So `prepack` applies `publishConfig.exports` and `postpack` restores
 * the original package.json, and the published package never points at files it doesn't contain.
 *
 * Usage: node scripts/publish-exports.mjs apply|restore|check <package.json>
 */
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs'

const [command, file = 'package.json'] = process.argv.slice(2)
const backup = `${file}.prepack`

if (command === 'apply') {
  const original = readFileSync(file, 'utf8')
  const pkg = JSON.parse(original)
  if (pkg.publishConfig?.exports) {
    writeFileSync(backup, original)
    const {exports, ...publishConfig} = pkg.publishConfig
    pkg.exports = exports
    if (Object.keys(publishConfig).length) pkg.publishConfig = publishConfig
    else delete pkg.publishConfig
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  }
} else if (command === 'restore') {
  if (existsSync(backup)) renameSync(backup, file)
} else if (command === 'check') {
  // Fails if the given (packed) package.json would ship a `source` condition
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (JSON.stringify(pkg.exports).includes('"source"')) {
    console.error(`${file}: exports still contain a "source" condition`)
    process.exit(1)
  }
  process.stdout.write(`${file}: exports OK ${JSON.stringify(pkg.exports)}\n`)
} else {
  console.error('Usage: node scripts/publish-exports.mjs apply|restore|check [package.json]')
  process.exit(1)
}
