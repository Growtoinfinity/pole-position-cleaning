/**
 * Lead Connector webhook targets — server-side only.
 * Do not import this module from `src/` (would expose URLs in the client bundle).
 */

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

export const VALID_WEBHOOK_STEPS = new Set(Object.keys(WEBHOOKS))

export function isValidWebhookStep(step: string): boolean {
  return VALID_WEBHOOK_STEPS.has(step)
}

export async function forwardWebhook(
  step: string,
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  const webhookUrl = WEBHOOKS[step]
  if (!webhookUrl) {
    return { status: 400, data: { error: 'Invalid step' } }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
