import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { handleSubmissionRequest } from './api/submission'
import { sweepAbandoned } from './api/abandonment'
import { handlePricingRequest } from './api/pricing'
import { handlePrefill } from './api/prefill'

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/** Mirrors Vercel `/api/submission` (`?action=start|step|quote|complete|get`) in dev. */
function submissionDevProxy(): Plugin {
  return {
    name: 'submission-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/submission')) {
          next()
          return
        }
        try {
          const parsed = new URL(url, 'http://localhost')
          const raw = req.method === 'GET' ? '' : await readRequestBody(req)
          const { status, data } = await handleSubmissionRequest({
            action: parsed.searchParams.get('action') ?? '',
            method: req.method ?? 'GET',
            token: parsed.searchParams.get('token'),
            body: raw ? JSON.parse(raw) : {},
          })
          sendJson(res, status, data)
        } catch (e) {
          console.error('Dev submission proxy error:', e)
          sendJson(res, 500, { error: 'Submission request failed' })
        }
      })
    },
  }
}

/** Mirrors Vercel `/api/pricing` (`?action=table|commit`) in dev. */
function pricingDevProxy(): Plugin {
  return {
    name: 'pricing-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/pricing')) {
          next()
          return
        }
        try {
          const parsed = new URL(url, 'http://localhost')
          const raw = req.method === 'GET' ? '' : await readRequestBody(req)
          const { status, data } = await handlePricingRequest({
            action: parsed.searchParams.get('action') ?? '',
            method: req.method ?? 'GET',
            body: raw ? JSON.parse(raw) : {},
          })
          sendJson(res, status, data)
        } catch (e) {
          console.error('Dev pricing proxy error:', e)
          sendJson(res, 500, { error: 'Pricing request failed' })
        }
      })
    },
  }
}

/** Mirrors Vercel `/api/prefill` in dev, bearer check included. */
function prefillDevProxy(): Plugin {
  return {
    name: 'prefill-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!(req.url ?? '').startsWith('/api/prefill')) {
          next()
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          return
        }
        // The same refusal as production, so an unset key fails here too rather than
        // leaving the endpoint quietly open on a machine holding real credentials.
        const key = process.env.PREFILL_API_KEY
        if (!key || req.headers.authorization !== `Bearer ${key}`) {
          sendJson(res, 401, { ok: false, error: 'Unauthorized' })
          return
        }
        /**
         * Parsed separately from the call, so a malformed body is a 400 here exactly as it
         * is in production.
         *
         * Inside the same `try` it became a 500 — and the caller docs tell integrators that
         * a 500 is worth retrying and a 400 never is. Someone building against `npm run dev`
         * would have written a retry loop around a request that can only ever fail.
         */
        let body: unknown
        try {
          const raw = await readRequestBody(req)
          body = raw ? JSON.parse(raw) : {}
        } catch {
          sendJson(res, 400, { ok: false, error: 'Body is not valid JSON' })
          return
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          sendJson(res, 400, { ok: false, error: 'Body must be a JSON object' })
          return
        }

        try {
          const { status, data } = await handlePrefill({
            body: body as Record<string, unknown>,
            baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
          })
          sendJson(res, status, data)
        } catch (e) {
          console.error('Dev prefill error:', e)
          sendJson(res, 500, { ok: false, error: 'Prefill failed' })
        }
      })
    },
  }
}

/** Mirrors the Vercel cron route so the sweep can be run by hand in dev. */
function abandonmentDevProxy(): Plugin {
  return {
    name: 'abandonment-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!(req.url ?? '').startsWith('/api/abandonment')) {
          next()
          return
        }
        const secret = process.env.CRON_SECRET
        if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
        try {
          sendJson(res, 200, await sweepAbandoned())
        } catch (e) {
          console.error('Dev abandonment sweep error:', e)
          sendJson(res, 500, { error: 'Sweep failed' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The api/ handlers read `process.env` directly. Vite only exposes VITE_-prefixed vars
  // to the client bundle, so load the rest here for the dev middleware above — this runs
  // in Node at config time and does not inline anything into the browser build.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    // Deprecated fallback — drop with the one in api/_lib/supabaseServer.ts
    'SUPABASE_SERVICE_ROLE_KEY',
    'GHL_LOCATION_ID',
    'GHL_PIT_TOKEN',
    'PRICING_API_KEY',
    'PRICING_API_URL',
    'PRICING_PARITY_APPROVED',
    'CRON_SECRET',
    'ABANDONMENT_IDLE_MINUTES',
    'ABANDONMENT_MAX_AGE_DAYS',
    'PREFILL_API_KEY',
    'PUBLIC_BASE_URL',
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      submissionDevProxy(),
      pricingDevProxy(),
      abandonmentDevProxy(),
      prefillDevProxy(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
