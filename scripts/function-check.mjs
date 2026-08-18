/**
 * Catches the class of bug that took the live form down: an import that vite resolves in
 * dev but Node's ESM loader refuses in production.
 *
 * Vercel compiles api/**\/*.ts to ESM (package.json declares "type": "module") and Node's
 * ESM resolver does not guess extensions, so `from './_lib/supabaseServer'` throws
 * ERR_MODULE_NOT_FOUND at import time — before any handler code runs. Nothing else in the
 * toolchain sees it: the vite dev middlewares resolve extensionless specifiers happily,
 * `tsc` is set to moduleResolution "bundler", and `vite build` only ever touches src/.
 * The form loads, the customer fills it in, and every lead is dropped on a 200.
 *
 * This transpiles the server tree the way Vercel does and asks Node to actually resolve
 * each route's module graph. It does not invoke the handlers, so it needs no credentials
 * and writes nothing.
 */
import { build } from 'esbuild'
import { globSync } from 'node:fs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const OUT = 'node_modules/.cache/function-check'
const ROUTES = ['submission', 'pricing', 'abandonment']

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Transpile only — never bundle. Bundling would paper over exactly the resolution failure
// this script exists to catch.
await build({
  entryPoints: [...globSync('api/*.ts'), ...globSync('api/_lib/*.ts'), ...globSync('src/lib/*.ts')],
  outdir: OUT,
  outbase: '.',
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})

// The transpiled tree needs its own ESM marker; it sits under node_modules/.cache, whose
// nearest package.json is not the project's.
writeFileSync(`${OUT}/package.json`, '{"type":"module"}')

let failed = 0
for (const route of ROUTES) {
  const target = pathToFileURL(resolve(`${OUT}/api/${route}.js`)).href
  try {
    const mod = await import(target)
    if (typeof mod.default !== 'function') {
      console.error(`FAIL  /api/${route} — loaded but exports no default handler`)
      failed += 1
    } else {
      console.log(`PASS  /api/${route}`)
    }
  } catch (error) {
    console.error(`FAIL  /api/${route} — ${String(error.message).split('\n')[0]}`)
    failed += 1
  }
}

if (failed) {
  console.error(`\n${failed} route(s) would crash on Vercel with a module-resolution error.`)
  process.exit(1)
}
console.log('\nAll routes resolve under Node ESM.')
