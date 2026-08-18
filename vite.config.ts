import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { forwardWebhook, isValidWebhookStep } from './api/webhook'
import { handleSubmissionRequest } from './api/submission'
import { handlePricingRequest } from './api/pricing'

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

/** Mirrors Vercel `/api/webhook` so `npm run dev` can POST to the same path as production. */
function kingsWebhookDevProxy(): Plugin {
  return {
    name: 'kings-webhook-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/webhook')) {
          next()
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }
        try {
          const parsed = new URL(url, 'http://localhost')
          const step = parsed.searchParams.get('step')
          if (!step || !isValidWebhookStep(step)) {
            sendJson(res, 400, { error: 'Invalid step' })
            return
          }
          const raw = await readRequestBody(req)
          const body = raw ? JSON.parse(raw) : {}
          const { status, data } = await forwardWebhook(step, body)
          sendJson(res, status, data)
        } catch (e) {
          console.error('Dev webhook proxy error:', e)
          sendJson(res, 500, { error: 'Webhook request failed' })
        }
      })
    },
  }
}

/** Mirrors Vercel `/api/submission` (`?action=start|step|quote|complete|get`) in dev. */
function kingsSubmissionDevProxy(): Plugin {
  return {
    name: 'kings-submission-dev-proxy',
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
function kingsPricingDevProxy(): Plugin {
  return {
    name: 'kings-pricing-dev-proxy',
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The api/ handlers read `process.env` directly. Vite only exposes VITE_-prefixed vars
  // to the client bundle, so load the rest here for the dev middleware above — this runs
  // in Node at config time and does not inline anything into the browser build.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GHL_LOCATION_ID',
    'GHL_PIT_TOKEN',
    'PRICING_API_KEY',
    'PRICING_API_URL',
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      kingsWebhookDevProxy(),
      kingsSubmissionDevProxy(),
      kingsPricingDevProxy(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
