/**
 * The `?token=` URL param — the only piece of form state that ever lives in the URL now
 * that the compressed url-state / lead-url mechanisms are gone.
 */

export const TOKEN_PARAM = 'token'

/** Reads the resume token out of the current address bar. */
export function getTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get(TOKEN_PARAM)
  return value && value.trim() ? value.trim() : null
}

/** Puts `?token=` in the address bar without adding a history entry. */
export function writeTokenToUrl(token: string): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get(TOKEN_PARAM) === token) return
  url.searchParams.set(TOKEN_PARAM, token)
  window.history.replaceState({}, '', url.toString())
}

/** Drops `?token=` — used when the form is reset for a fresh quote. */
export function clearTokenFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(TOKEN_PARAM)) return
  url.searchParams.delete(TOKEN_PARAM)
  window.history.replaceState({}, '', url.toString())
}
