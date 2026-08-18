/**
 * Hook for the "continue from where you left off" feature.
 *
 * Since the v3 migration this is purely token-based: the Supabase submission token is
 * mirrored into the address bar as `?token=…` so a refresh (or a link from a GHL email
 * built on `{{contact.webform_token}}`) resumes the form. No form state is ever encoded
 * into the URL any more.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useFormStore } from '@/stores/formStore'
import { clearTokenFromUrl, writeTokenToUrl } from '@/lib/token-url'

export function useContinueUrl() {
  const step = useFormStore((state) => state.step)
  const token = useFormStore((state) => state.token)
  const getContinueUrl = useFormStore((state) => state.getContinueUrl)

  // Only a token we previously held may be cleared. On first mount the store token is
  // still null while `?token=` sits in the URL waiting to be resumed — clearing it here
  // would strip the param before App ever gets to read it.
  const lastToken = useRef<string | null>(null)

  useEffect(() => {
    if (token) {
      writeTokenToUrl(token)
      lastToken.current = token
      return
    }
    if (lastToken.current) {
      // Token went away — the form was reset for a fresh quote
      clearTokenFromUrl()
      lastToken.current = null
    }
  }, [token])

  const continueUrl = useCallback(() => getContinueUrl(), [getContinueUrl])

  return {
    continueUrl,
    currentStep: step,
  }
}

export default useContinueUrl
