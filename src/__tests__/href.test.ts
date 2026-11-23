import {describe, expect, it} from 'vitest'

import {
  getSystemLinkType,
  isAnchorHref,
  isInternalLinkHref,
  normalizeAnchorHref,
  normalizeLinkHref,
} from '../href'

describe('normalizeLinkHref', () => {
  it.each([
    ['/about', '/about'],
    ['  /about  ', '/about'],
    ['#section', '#section'],
    ['?q=1', '?q=1'],
    ['https://example.com/a?b#c', 'https://example.com/a?b#c'],
    ['HTTP://example.com', 'HTTP://example.com'],
    ['example.com', 'https://example.com'],
    ['shop.example.co.uk/path?x=1', 'https://shop.example.co.uk/path?x=1'],
    ['localhost.dev:3000/x', 'https://localhost.dev:3000/x'],
    ['hello@example.com', 'mailto:hello@example.com'],
    ['mailto:hello@example.com', 'mailto:hello@example.com'],
    ['MAILTO: hello@example.com', 'mailto:hello@example.com'],
    ['+1 (555) 555-0123', 'tel:+15555550123'],
    ['555-555-0123', 'tel:5555550123'],
    ['tel:+44 20 7946 0958', 'tel:+442079460958'],
    ['//example.com/path', 'https://example.com/path'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeLinkHref(input)).toBe(expected)
  })

  it.each([
    [''],
    ['   '],
    [null],
    [undefined],
    ['not a link'],
    ['javascript:alert(1)'],
    ['mailto:not-an-email'],
    ['tel:123'],
    ['12345'],
    ['https://'],
    ['ftp://example.com'],
    ['/\\evil.com'],
    ['\\\\evil.com'],
    ['//'],
  ])('rejects %j', (input) => {
    expect(normalizeLinkHref(input)).toBeNull()
  })
})

describe('isInternalLinkHref', () => {
  it('treats paths, hashes and query strings as internal', () => {
    expect(isInternalLinkHref('/a')).toBe(true)
    expect(isInternalLinkHref('#a')).toBe(true)
    expect(isInternalLinkHref('?a')).toBe(true)
  })

  it('treats absolute URLs as external', () => {
    expect(isInternalLinkHref('https://example.com')).toBe(false)
    expect(isInternalLinkHref('//example.com')).toBe(false)
    expect(isInternalLinkHref(undefined)).toBe(false)
  })
})

describe('getSystemLinkType', () => {
  it.each([
    ['/about', 'internal'],
    ['https://example.com', 'external'],
    ['mailto:a@b.co', 'email'],
    ['tel:+15555550123', 'phone'],
  ])('classifies %j as %j', (href, type) => {
    expect(getSystemLinkType(href)).toBe(type)
  })
})

describe('normalizeAnchorHref', () => {
  it.each([
    ['team', '#team'],
    ['#team', '#team'],
    ['  ##team  ', '#team'],
    ['Our Team', '#Our-Team'],
    ['', null],
    ['#', null],
    [null, null],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeAnchorHref(input)).toBe(expected)
  })
})

describe('isAnchorHref', () => {
  it.each([
    ['#team', true],
    ['#a-b_c.1', true],
    ['team', false],
    ['#', false],
    ['#our team', false],
    ['#a#b', false],
    ['/page#team', false],
  ])('%j -> %j', (input, expected) => {
    expect(isAnchorHref(input)).toBe(expected)
  })
})
