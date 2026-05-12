import type { VercelRequest, VercelResponse } from '@vercel/node'
import { forwardWebhook, isValidWebhookStep } from '../server/forward-webhook'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawStep = req.query.step
  const step = (Array.isArray(rawStep) ? rawStep[0] : rawStep) as string | undefined
  if (!step || !isValidWebhookStep(step)) {
    return res.status(400).json({ error: 'Invalid step' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
    const { status, data } = await forwardWebhook(step, body)
    return res.status(status).json(data)
  } catch (error) {
    console.error('Webhook proxy error:', error)
    return res.status(500).json({ error: 'Webhook request failed' })
  }
}
