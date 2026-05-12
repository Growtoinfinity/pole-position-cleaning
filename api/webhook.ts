import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── Webhook URLs (server-side only, NEVER sent to browser) ───
const WEBHOOKS: Record<string, string> = {
  contact:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/6e0b2a42-77ba-4bfa-a83b-3b4b3d130e37',

  residentialType:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  bungalowType:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  bungalowTypeMobile:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  townhouseType:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  townhouseTypeMobile:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',

  propertyDetails:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/VgZnBHG8l0C1QBSBJIv3',

  residentialFrequency:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/FyK4jb9ilfkJJ7nRPH7p',

  residentialBook:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/FcRKc7hsELqvoqlii0sn',
  finalSubmission:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/FcRKc7hsELqvoqlii0sn',

  residentialLargeAddress:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/bNH63ZL2RTHDf3ge2Ikr',
  residentialLargePropertyDetails:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/VgZnBHG8l0C1QBSBJIv3',
  commercialDetails:
    'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/bNH63ZL2RTHDf3ge2Ikr',
}

const VALID_STEPS = new Set(Object.keys(WEBHOOKS))

/** Used by Vite dev middleware only */
export function isValidWebhookStep(step: string): boolean {
  return VALID_STEPS.has(step)
}

/** Used by Vite dev middleware only */
export async function forwardWebhook(
  step: string,
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  const webhookUrl = WEBHOOKS[step]
  if (!webhookUrl) {
    return { status: 400, data: { error: 'Invalid step' } }
  }

  const payload =
    typeof body === 'string' ? body : JSON.stringify(body ?? {})

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })

  const contentType = response.headers.get('content-type')
  let data: unknown
  if (contentType?.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = { message: 'Request completed successfully' }
    }
  } else {
    const text = await response.text().catch(() => '')
    data = { message: text || 'Request completed successfully' }
  }

  return { status: response.ok ? 200 : response.status, data }
}

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

  if (!step || !VALID_STEPS.has(step)) {
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
