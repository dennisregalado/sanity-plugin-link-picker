import {createClient} from '@sanity/client'
import {describe, expect, it} from 'vitest'

import {
  buildSectionAnchorDocuments,
  getAnchorDocumentId,
  getSectionAnchors,
  type SectionAnchorClient,
  type SectionAnchorDocument,
  slugify,
  syncSectionAnchors,
} from '../anchors'

describe('slugify', () => {
  it.each([
    ['Meet the Team!', 'meet-the-team'],
    ['  Café & Bar  ', 'cafe-bar'],
    ['FAQ: 2026', 'faq-2026'],
    ['---', ''],
    ['日本語', ''],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('caps the length without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(95)} b`)
    expect(slug.length).toBeLessThanOrEqual(96)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('getSectionAnchors', () => {
  it('derives slugs from headings, unique within the document', () => {
    expect(
      getSectionAnchors([
        {_key: 'a', _type: 'hero', heading: 'Features'},
        {_key: 'b', _type: 'grid', title: 'Features'},
        {_key: 'c', _type: 'cta', name: 'Contact us'},
        {_key: 'd', _type: 'faq', label: 'Features'},
      ]),
    ).toEqual([
      {key: 'a', title: 'Features', slug: 'features', order: 0},
      {key: 'b', title: 'Features', slug: 'features-2', order: 1},
      {key: 'c', title: 'Contact us', slug: 'contact-us', order: 2},
      {key: 'd', title: 'Features', slug: 'features-3', order: 3},
    ])
  })

  it('skips sections without a key or heading, keeping their position in `order`', () => {
    expect(
      getSectionAnchors([
        {_type: 'hero', heading: 'No key'},
        {_key: 'b', _type: 'spacer'},
        {_key: 'c', heading: '   '},
        {_key: 'd', heading: 'Kept'},
      ]),
    ).toEqual([{key: 'd', title: 'Kept', slug: 'kept', order: 3}])
  })

  it('reads Portable Text headings', () => {
    const heading = [
      {
        _type: 'block',
        children: [
          {_type: 'span', text: 'Rich '},
          {_type: 'span', text: 'text'},
        ],
      },
    ]
    expect(getSectionAnchors([{_key: 'a', heading}])[0]?.slug).toBe('rich-text')
  })

  it('falls back to `section` when a heading has no slug characters', () => {
    expect(getSectionAnchors([{_key: 'a', heading: '日本語'}])[0]?.slug).toBe('section')
  })

  it('accepts a custom title reader', () => {
    const anchors = getSectionAnchors([{_key: 'a', eyebrow: 'Custom'}], {
      getTitle: (section) => (typeof section.eyebrow === 'string' ? section.eyebrow : undefined),
    })
    expect(anchors[0]?.slug).toBe('custom')
  })

  it("uses a section's own slug, which keeps its anchor when the heading changes", () => {
    expect(
      getSectionAnchors([
        {_key: 'a', heading: 'Meet the people', slug: {_type: 'slug', current: 'team'}},
        {_key: 'b', heading: 'Pricing', slug: '#Plans & Pricing'},
      ]),
    ).toEqual([
      {key: 'a', title: 'Meet the people', slug: 'team', order: 0},
      {key: 'b', title: 'Pricing', slug: 'plans-pricing', order: 1},
    ])
  })

  it('reserves own slugs before generating, so a later section keeps the slug it chose', () => {
    expect(
      getSectionAnchors([
        {_key: 'a', heading: 'Team'},
        {_key: 'b', heading: 'Our people', slug: 'team'},
        {_key: 'c', heading: 'Crew', slug: 'team'},
      ]).map((anchor) => anchor.slug),
    ).toEqual(['team-3', 'team', 'team-2'])
  })

  it('gives a section with a slug but no heading an anchor titled by its slug', () => {
    expect(getSectionAnchors([{_key: 'a', slug: 'contact'}])).toEqual([
      {key: 'a', title: 'contact', slug: 'contact', order: 0},
    ])
  })

  it('generates from the heading when the slug is empty, and accepts a custom slug reader', () => {
    expect(getSectionAnchors([{_key: 'a', heading: 'FAQ', slug: {current: ' '}}])[0]?.slug).toBe(
      'faq',
    )
    const anchors = getSectionAnchors([{_key: 'a', heading: 'FAQ', anchorId: 'questions'}], {
      getSlug: (section) => (typeof section.anchorId === 'string' ? section.anchorId : undefined),
    })
    expect(anchors[0]?.slug).toBe('questions')
  })

  it('returns nothing for a missing sections array', () => {
    expect(getSectionAnchors(undefined)).toEqual([])
    expect(getSectionAnchors({})).toEqual([])
  })
})

describe('getAnchorDocumentId', () => {
  it('is deterministic and only uses id-safe characters', () => {
    expect(getAnchorDocumentId('page-1', 'abc123')).toBe('anchor-page-1-abc123')
    expect(getAnchorDocumentId('some.path.id', 'k:1')).toBe('anchor-some_path_id-k_1')
  })

  it('stays within the id length limit', () => {
    expect(getAnchorDocumentId('x'.repeat(200), 'key').length).toBeLessThanOrEqual(128)
  })
})

describe('buildSectionAnchorDocuments', () => {
  it('references the published parent with a weak reference', () => {
    const [anchor] = buildSectionAnchorDocuments({
      _id: 'drafts.page-1',
      sections: [{_key: 'a', heading: 'Team'}],
    })
    expect(anchor).toEqual({
      _id: 'anchor-page-1-a',
      _type: 'sectionAnchor',
      title: 'Team',
      slug: {_type: 'slug', current: 'team'},
      parent: {_type: 'reference', _ref: 'page-1', _weak: true},
      sectionKey: 'a',
      order: 0,
    })
  })

  it('reads a custom sections field', () => {
    const anchors = buildSectionAnchorDocuments(
      {_id: 'page-1', blocks: [{_key: 'a', heading: 'Team'}]},
      {field: 'blocks'},
    )
    expect(anchors).toHaveLength(1)
  })
})

/** An in-memory stand-in for `@sanity/client`, recording committed mutations. */
function fakeClient(existing: SectionAnchorDocument[]) {
  const commits: {upserted: string[]; deleted: string[]}[] = []
  const fetches: Record<string, unknown>[] = []
  const client: SectionAnchorClient = {
    fetch: async <R>(_query: string, params: Record<string, unknown>) => {
      fetches.push(params)
      // The fake only answers the anchors query
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return existing.filter((anchor) => anchor.parent._ref === params.parentId) as R
    },
    transaction() {
      const commit = {upserted: [] as string[], deleted: [] as string[]}
      const transaction = {
        createOrReplace(document: SectionAnchorDocument) {
          commit.upserted.push(document._id)
          return transaction
        },
        delete(id: string) {
          commit.deleted.push(id)
          return transaction
        },
        async commit() {
          commits.push(commit)
          return {}
        },
      }
      return transaction
    },
  }
  return {client, commits, fetches}
}

describe('syncSectionAnchors', () => {
  const page = {
    _id: 'page-1',
    sections: [
      {_key: 'a', heading: 'Intro'},
      {_key: 'b', heading: 'Team'},
    ],
  }

  it('creates anchors for new sections', async () => {
    const {client, commits} = fakeClient([])
    const result = await syncSectionAnchors(client, page)
    expect(result).toEqual({upserted: ['anchor-page-1-a', 'anchor-page-1-b'], deleted: []})
    expect(commits).toEqual([result])
  })

  it('skips unchanged anchors and writes nothing when all match', async () => {
    const {client, commits} = fakeClient(buildSectionAnchorDocuments(page))
    const result = await syncSectionAnchors(client, page)
    expect(result).toEqual({upserted: [], deleted: []})
    expect(commits).toEqual([])
  })

  it('updates renamed or reordered sections and deletes removed ones', async () => {
    const {client, commits} = fakeClient(buildSectionAnchorDocuments(page))
    const result = await syncSectionAnchors(client, {
      _id: 'page-1',
      sections: [{_key: 'b', heading: 'Our team'}],
    })
    expect(result).toEqual({upserted: ['anchor-page-1-b'], deleted: ['anchor-page-1-a']})
    expect(commits).toHaveLength(1)
  })

  it('deletes every anchor on a delete event', async () => {
    const {client} = fakeClient(buildSectionAnchorDocuments(page))
    const result = await syncSectionAnchors(client, {...page, operation: 'delete'})
    expect(result).toEqual({upserted: [], deleted: ['anchor-page-1-a', 'anchor-page-1-b']})
  })

  it('deletes every anchor when the sections field is removed', async () => {
    const {client} = fakeClient(buildSectionAnchorDocuments(page))
    const result = await syncSectionAnchors(client, {_id: 'page-1'})
    expect(result.deleted).toHaveLength(2)
  })

  it('ignores drafts and release versions', async () => {
    const {client, fetches} = fakeClient([])
    expect(await syncSectionAnchors(client, {...page, _id: 'drafts.page-1'})).toMatchObject({
      skipped: 'draft',
    })
    expect(await syncSectionAnchors(client, {...page, _id: 'versions.r1.page-1'})).toMatchObject({
      skipped: 'draft',
    })
    expect(fetches).toEqual([])
  })

  it('computes changes without writing in a dry run', async () => {
    const {client, commits} = fakeClient([])
    const result = await syncSectionAnchors(client, page, {dryRun: true})
    expect(result.upserted).toHaveLength(2)
    expect(commits).toEqual([])
  })

  it('accepts a real @sanity/client client', () => {
    const client = createClient({projectId: 'abc123', dataset: 'test', apiVersion: '2025-05-08'})
    // Type-level check: createClient() satisfies SectionAnchorClient
    const anchorsClient: SectionAnchorClient = client
    expect(typeof anchorsClient.transaction).toBe('function')
  })
})
