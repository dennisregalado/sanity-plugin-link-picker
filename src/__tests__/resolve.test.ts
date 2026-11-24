import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import {getAnchorFragment, resolveLinkHref} from '../resolve'

type PageRef = {_type: string; slug?: string | null}

const resolveReference = (ref: PageRef) =>
  ref._type === 'page' && ref.slug ? `/${ref.slug}` : null

describe('getAnchorFragment', () => {
  it.each([
    ['#team', '#team'],
    ['team', '#team'],
    [{url: '#custom'}, '#custom'],
    [{url: null, slug: 'team'}, '#team'],
    [{slug: {current: 'team'}}, '#team'],
    [{reference: {slug: {current: 'team'}}}, '#team'],
    [{url: '#custom', slug: 'team'}, '#custom'],
    ['  ', ''],
    [{}, ''],
    [null, ''],
  ] as const)('%j -> %j', (anchor, expected) => {
    expect(getAnchorFragment(anchor)).toBe(expected)
  })
})

describe('resolveLinkHref', () => {
  it('returns the URL of a URL link', () => {
    expect(resolveLinkHref({url: 'https://example.com/a'})).toBe('https://example.com/a')
    expect(resolveLinkHref({url: ' /about '})).toBe('/about')
  })

  it("resolves a document link through resolveReference and adds its section's fragment", () => {
    expect(
      resolveLinkHref<PageRef>(
        {reference: {_type: 'page', slug: 'about'}, anchor: {slug: 'team'}},
        {resolveReference},
      ),
    ).toBe('/about#team')
  })

  it("returns null when a linked document can't be resolved, instead of a bare fragment", () => {
    const link = {reference: {_type: 'product', slug: 'shoe'}, anchor: '#sizes'}
    expect(resolveLinkHref<PageRef>(link, {resolveReference})).toBeNull()
    expect(resolveLinkHref(link)).toBeNull()
  })

  it('replaces a fragment already in the URL with the anchor', () => {
    expect(resolveLinkHref({url: '/about#old', anchor: '#team'})).toBe('/about#team')
    expect(resolveLinkHref({url: 'https://example.com/?q=1', anchor: 'faq'})).toBe(
      'https://example.com/?q=1#faq',
    )
    expect(resolveLinkHref({url: '?tab=2', anchor: '#faq'})).toBe('?tab=2#faq')
  })

  it('keeps the URL fragment when there is no anchor', () => {
    expect(resolveLinkHref({url: '/about#team', anchor: {url: null}})).toBe('/about#team')
  })

  it('ignores anchors on email and phone links', () => {
    expect(resolveLinkHref({url: 'mailto:hi@example.com', anchor: '#team'})).toBe(
      'mailto:hi@example.com',
    )
    expect(resolveLinkHref({url: 'tel:+15555550123', anchor: '#team'})).toBe('tel:+15555550123')
  })

  it('resolves an anchor-only link to the fragment', () => {
    expect(resolveLinkHref({anchor: {url: '#team'}})).toBe('#team')
  })

  it('returns null for empty links and unsupported schemes', () => {
    expect(resolveLinkHref(null)).toBeNull()
    expect(resolveLinkHref({})).toBeNull()
    expect(resolveLinkHref({url: '  '})).toBeNull()
    expect(resolveLinkHref({url: 'javascript:alert(1)'})).toBeNull()
    expect(resolveLinkHref({url: 'JavaScript:alert(1)', anchor: '#x'})).toBeNull()
    expect(resolveLinkHref({url: '//evil.example'})).toBeNull()
    expect(resolveLinkHref({url: 'data:text/html,hi'})).toBeNull()
  })

  it('refuses an unsafe path from resolveReference too', () => {
    expect(
      resolveLinkHref({reference: {}, anchor: '#a'}, {resolveReference: () => 'javascript:x'}),
    ).toBeNull()
  })
})

describe('sanity-plugin-link-picker/resolve', () => {
  it('imports nothing, so it adds only itself to a frontend bundle', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../resolve/index.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/\brequire\(|\bimport\(/)
  })
})
