import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import type { IncomingMessage } from 'node:http'
import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { forwardWebhook, isValidWebhookStep } from './server/forward-webhook'

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        try {
          const parsed = new URL(url, 'http://localhost')
          const step = parsed.searchParams.get('step')
          if (!step || !isValidWebhookStep(step)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Invalid step' }))
            return
          }
          const raw = await readRequestBody(req)
          const body = raw ? JSON.parse(raw) : {}
          const { status, data } = await forwardWebhook(step, body)
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (e) {
          console.error('Dev webhook proxy error:', e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Webhook request failed' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), kingsWebhookDevProxy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
