import {getPublishedId} from 'sanity'
import {describe, expect, it} from 'vitest'

import {buildSelectionPatches, getPublishedDocumentId} from '../patches'

describe('getPublishedDocumentId', () => {
  const ids = [
    'page-1',
    'drafts.page-1',
    'versions.rSpring.page-1',
    'versions.rSpring.page.with.dots',
    'drafts.page.with.dots',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'drafts.a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'versions.r123.a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  ]

  it.each(ids)('matches Studio for %j', (id) => {
    // Studio's own helper is only used here, as a reference; the plugin doesn't ship it
    expect(getPublishedDocumentId(id)).toBe(getPublishedId(id))
  })

  it('strips draft and release prefixes', () => {
    expect(getPublishedDocumentId('drafts.page-1')).toBe('page-1')
    expect(getPublishedDocumentId('versions.rSpring.page-1')).toBe('page-1')
    expect(getPublishedDocumentId('page-1')).toBe('page-1')
  })
})

describe('buildSelectionPatches', () => {
  it('stores a reference with the published id, even for draft and release hits', () => {
    for (const id of ['page-1', 'drafts.page-1', 'versions.rSpring.page-1']) {
      const patches = buildSelectionPatches('link', {_id: id, label: 'Page 1'})
      expect(patches).toContainEqual(
        expect.objectContaining({
          type: 'set',
          path: ['reference'],
          value: {_type: 'reference', _ref: 'page-1', _weak: true},
        }),
      )
      expect(patches).toContainEqual(expect.objectContaining({type: 'unset', path: ['url']}))
    }
  })

  it('stores a URL and unsets any reference', () => {
    const patches = buildSelectionPatches('link', {href: '/shop', label: 'Shop'})
    expect(patches).toContainEqual(
      expect.objectContaining({type: 'set', path: ['url'], value: '/shop'}),
    )
    expect(patches).toContainEqual(expect.objectContaining({type: 'unset', path: ['reference']}))
  })

  it('only patches the fields it owns, never the whole object', () => {
    const patches = buildSelectionPatches('link', {href: '/shop', label: 'Shop'})
    expect(patches.every((patch) => patch.path.length === 1 || patch.type === 'setIfMissing')).toBe(
      true,
    )
    expect(patches[0]).toEqual(
      expect.objectContaining({type: 'setIfMissing', path: [], value: {_type: 'link'}}),
    )
    expect(JSON.stringify(patches)).not.toContain('_key')
  })

  it('keeps the existing label when the selection has none (typed URLs)', () => {
    const patches = buildSelectionPatches('link', {href: 'https://example.com'})
    expect(patches.some((patch) => patch.path[0] === 'label')).toBe(false)
  })

  it('uses the schema type name', () => {
    expect(buildSelectionPatches('cta', {href: '/'})[0]).toEqual(
      expect.objectContaining({type: 'setIfMissing', value: {_type: 'cta'}}),
    )
  })
})
