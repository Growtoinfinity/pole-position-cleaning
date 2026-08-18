import type { VercelRequest, VercelResponse } from '@vercel/node'
import { forwardWebhook, isValidWebhookStep, WEBHOOKS } from './_lib/webhooks'

/** Re-exported for the Vite dev middleware in `vite.config.ts`. */
export { forwardWebhook, isValidWebhookStep }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawStep = req.query.step
  const step =
    typeof rawStep === 'string'
      ? rawStep
      : Array.isArray(rawStep)
        ? rawStep[0]
        : undefined

  if (!step || !isValidWebhookStep(step)) {
    return res.status(400).json({ error: 'Invalid step' })
  }

  const webhookUrl = WEBHOOKS[step]

  if (!webhookUrl) {
    return res
      .status(200)
      .json({ message: `Webhook not configured for step: ${step}` })
  }

  try {
    let body: unknown
    if (typeof req.body === 'string') {
      try {
        body = req.body ? JSON.parse(req.body) : {}
      } catch {
        body = {}
      }
    } else {
      body = req.body ?? {}
    }

    const { status, data } = await forwardWebhook(step, body)
    return res.status(status).json(data)
  } catch (error) {
    console.error('Webhook proxy error:', error)
    return res.status(500).json({ error: 'Webhook request failed' })
  }
}
