/** Pure helpers for classifying and normalising link values. */

export type SystemLinkType = 'internal' | 'external' | 'email' | 'phone'

/**
 * Normalises a typed link into a stored `url` value, or returns `null` if it isn't a valid link.
 *
 * Accepts paths, hashes, query strings, `http(s)` URLs, bare domains, email addresses and phone
 * numbers. Protocol-relative URLs (`//example.com`) are external, so they are stored as `https:`.
 * Backslashes are rejected because browsers treat them as `/` (`/\\example.com` opens a
 * different host).
 */
export function normalizeLinkHref(value: string | null | undefined): string | null {
  const input = value?.trim()

  if (!input || input.includes('\\')) {
    return null
  }

  if (input.startsWith('//')) {
    const url = `https:${input}`
    return isAbsoluteUrl(url) ? url : null
  }

  if (input.startsWith('/') || input.startsWith('#') || input.startsWith('?')) {
    return input
  }

  if (/^mailto:/i.test(input)) {
    const email = input.slice('mailto:'.length).trim()
    return isEmailAddress(email) ? `mailto:${email}` : null
  }

  if (isEmailAddress(input)) {
    return `mailto:${input}`
  }

  if (/^tel:/i.test(input)) {
    const phone = normalizePhoneNumber(input.slice('tel:'.length))
    return phone ? `tel:${phone}` : null
  }

  const phone = normalizePhoneNumber(input)
  if (phone) {
    return `tel:${phone}`
  }

  if (/^https?:\/\//i.test(input)) {
    return isAbsoluteUrl(input) ? input : null
  }

  if (looksLikeDomain(input)) {
    return `https://${input}`
  }

  return null
}

export function isInternalLinkHref(value: string | null | undefined): boolean {
  if (!value || value.startsWith('//')) return false
  return value.startsWith('/') || value.startsWith('#') || value.startsWith('?')
}

export function getSystemLinkType(href: string): SystemLinkType {
  if (href.startsWith('mailto:')) {
    return 'email'
  }

  if (href.startsWith('tel:')) {
    return 'phone'
  }

  return isInternalLinkHref(href) ? 'internal' : 'external'
}

function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim()

  if (!/^\+?[\d\s().-]+$/.test(trimmed)) {
    return null
  }

  const digits = trimmed.replace(/\D/g, '')

  if (digits.length < (trimmed.startsWith('+') ? 7 : 10)) {
    return null
  }

  return `${trimmed.startsWith('+') ? '+' : ''}${digits}`
}

function isAbsoluteUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function looksLikeDomain(value: string) {
  if (/\s/.test(value) || value.includes('@')) {
    return false
  }

  return /^(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d+)?(?:[/?#].*)?$/i.test(value)
}
