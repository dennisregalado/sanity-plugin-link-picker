import {createClient} from '@sanity/client'
import {Schema} from '@sanity/schema'
import {createInstance} from 'i18next'
import type {LocaleSource, ValidationContext} from 'sanity'
import {describe, expect, it, vi} from 'vitest'

import {
  getAnchorTarget,
  getValidationMessage,
  URL_TARGET,
  validateAnchorUrl,
  validateLinkAnchor,
  validateLinkReference,
  validateLinkUrl,
  validateSectionReference,
} from '../validation'

type Dataset = {
  /** Published document ids */
  published?: string[]
  /** Ids with a draft or release version but nothing published */
  versions?: string[]
  /** Section anchor id → its page's id */
  anchorParents?: Record<string, string>
}

const schema = Schema.compile({name: 'test', types: []})

/** A validation context backed by an in-memory dataset. */
/** A Studio locale source with the given plugin strings. */
async function localeSource(
  locale: string,
  strings: Record<string, string>,
  loadNamespaces?: () => Promise<void>,
): Promise<LocaleSource> {
  const i18n = createInstance()
  await i18n.init({
    lng: locale,
    resources: {[locale]: {'sanity-plugin-link-picker': strings}},
  })
  return {
    currentLocale: {
      id: locale,
      title: locale,
      weekInfo: {firstDay: 1, weekend: [6, 7]},
    },
    locales: [],
    loadNamespaces: loadNamespaces ?? (async (namespaces) => i18n.loadNamespaces(namespaces)),
    t: i18n.t,
  }
}

async function makeContext(
  dataset: Dataset,
  extra: {
    parent?: unknown
    documentId?: string
    i18n?: LocaleSource
    studio?: boolean
  } = {},
): Promise<{context: ValidationContext; queries: string[]}> {
  const queries: string[] = []
  const client = createClient({
    projectId: 'p',
    dataset: 'd',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const answer = (query: string, id: string): unknown => {
    queries.push(query)
    if (query.includes('versionOf')) return dataset.versions?.includes(id) ?? false
    if (query.includes('parent._ref')) return dataset.anchorParents?.[id] ?? null
    return dataset.published?.includes(id) ?? false
  }
  vi.spyOn(client, 'fetch').mockImplementation(
    // @ts-expect-error -- the client's fetch is overloaded; the validators only use (query, params, options)
    async (query: string, params: {id: string}) => answer(query, params.id),
  )

  const context = {
    getClient: () => client,
    schema,
    environment: 'studio' as const,
    parent: extra.parent,
    document: extra.documentId
      ? {_id: extra.documentId, _type: 'page', _createdAt: '', _updatedAt: '', _rev: ''}
      : undefined,
    path: [],
    // Studio tracks referenced documents itself; the CLI doesn't
    getDocumentExists: extra.studio
      ? async ({id}: {id: string}) => dataset.published?.includes(id) ?? false
      : undefined,
    i18n: extra.i18n ?? (await localeSource('en-US', {})),
  }
  return {context, queries}
}

describe('validateLinkUrl / validateAnchorUrl', () => {
  it('accepts valid values and empty fields', async () => {
    const {context} = await makeContext({})
    const values = [undefined, '', '/about', '?q=1', 'example.com', 'hi@example.com']
    expect(await Promise.all(values.map((value) => validateLinkUrl(value, context)))).toEqual(
      values.map(() => true),
    )
    expect(await validateAnchorUrl('#team', context)).toBe(true)
    expect(await validateAnchorUrl(undefined, context)).toBe(true)
  })

  it('rejects invalid values in English without Studio i18n', async () => {
    const {context} = await makeContext({})
    expect(await validateLinkUrl('javascript:alert(1)', context)).toBe(
      'Must be a path, query string, URL, email address, or phone number',
    )
    expect(await validateAnchorUrl('#my section', context)).toBe(
      'Must be a fragment like #my-section, without spaces',
    )
  })
})

describe('getValidationMessage', () => {
  it("translates through Studio's i18n, loading the plugin's namespace first", async () => {
    const loadNamespaces = vi.fn(async () => undefined)
    const i18n = await localeSource(
      'nb-NO',
      {'validation.section-missing': 'Seksjonen finnes ikke'},
      loadNamespaces,
    )
    const {context} = await makeContext({}, {i18n})
    expect(await getValidationMessage(context, 'validation.section-missing')).toBe(
      'Seksjonen finnes ikke',
    )
    expect(loadNamespaces).toHaveBeenCalledWith(['sanity-plugin-link-picker'])
  })

  it('falls back to English when a string is missing or loading fails', async () => {
    const missing = (await makeContext({}, {i18n: await localeSource('nb-NO', {})})).context
    expect(await getValidationMessage(missing, 'validation.reference-missing')).toBe(
      "The linked document doesn't exist anymore",
    )
    const failing = await localeSource('nb-NO', {}, async () =>
      Promise.reject(new Error('offline')),
    )
    expect(
      await getValidationMessage(
        (await makeContext({}, {i18n: failing})).context,
        'validation.reference-missing',
      ),
    ).toBe("The linked document doesn't exist anymore")
  })
})

describe('validateLinkReference', () => {
  const ref = {_type: 'reference', _ref: 'page-1', _weak: true}

  it('passes for a published document, in Studio and the CLI', async () => {
    expect(
      await validateLinkReference(
        ref,
        (await makeContext({published: ['page-1']}, {studio: true})).context,
      ),
    ).toBe(true)
    expect(
      await validateLinkReference(ref, (await makeContext({published: ['page-1']})).context),
    ).toBe(true)
  })

  it('warns that a document only in drafts or a release is not published yet', async () => {
    expect(
      await validateLinkReference(
        ref,
        (await makeContext({versions: ['page-1']}, {studio: true})).context,
      ),
    ).toBe("The linked document isn't published yet, so the link won't work until it is")
  })

  it('warns that a deleted document no longer exists', async () => {
    expect(await validateLinkReference(ref, (await makeContext({}, {studio: true})).context)).toBe(
      "The linked document doesn't exist anymore",
    )
  })

  it('skips empty references without querying', async () => {
    const {context, queries} = await makeContext({})
    expect(await validateLinkReference(undefined, context)).toBe(true)
    expect(await validateLinkReference({_ref: ''}, context)).toBe(true)
    expect(queries).toEqual([])
  })
})

describe('validateSectionReference', () => {
  it('warns when the section no longer exists', async () => {
    const ref = {_ref: 'anchor-page-1-a'}
    expect(
      await validateSectionReference(
        ref,
        (await makeContext({published: [ref._ref]}, {studio: true})).context,
      ),
    ).toBe(true)
    expect(
      await validateSectionReference(ref, (await makeContext({}, {studio: true})).context),
    ).toBe("This section doesn't exist anymore")
  })
})

describe('getAnchorTarget', () => {
  it('is the linked document, the edited document for an anchor-only link, or `url`', () => {
    expect(getAnchorTarget({reference: {_ref: 'page-2'}}, 'drafts.page-1')).toBe('page-2')
    expect(getAnchorTarget({}, 'drafts.page-1')).toBe('page-1')
    expect(getAnchorTarget({url: '#top'}, 'versions.r1.page-1')).toBe('page-1')
    expect(getAnchorTarget({url: '/about'}, 'page-1')).toBe(URL_TARGET)
    expect(getAnchorTarget({url: 'https://example.com'}, 'page-1')).toBe(URL_TARGET)
    expect(getAnchorTarget(undefined, undefined)).toBeUndefined()
  })
})

describe('validateLinkAnchor', () => {
  const dataset: Dataset = {anchorParents: {'anchor-page-1-a': 'page-1'}}
  const anchor = {reference: {_ref: 'anchor-page-1-a'}}

  it("passes when the section is on the link's page", async () => {
    const linked = await makeContext(dataset, {
      parent: {reference: {_ref: 'page-1'}},
      documentId: 'home',
    })
    expect(await validateLinkAnchor(anchor, linked.context)).toBe(true)
    const sameDocument = await makeContext(dataset, {parent: {}, documentId: 'drafts.page-1'})
    expect(await validateLinkAnchor(anchor, sameDocument.context)).toBe(true)
  })

  it('warns on the section when it is on another page', async () => {
    const {context} = await makeContext(dataset, {
      parent: {reference: {_ref: 'page-2'}},
      documentId: 'home',
    })
    expect(await validateLinkAnchor(anchor, context)).toEqual({
      message: "This section isn't on the page this link goes to",
      path: ['reference'],
    })
    const anchorOnly = await makeContext(dataset, {parent: {url: '#x'}, documentId: 'home'})
    expect(await validateLinkAnchor(anchor, anchorOnly.context)).toEqual({
      message: "This section isn't on the page this link goes to",
      path: ['reference'],
    })
  })

  it('warns that sections need a document link, without querying', async () => {
    const {context, queries} = await makeContext(dataset, {
      parent: {url: '/about'},
      documentId: 'home',
    })
    expect(await validateLinkAnchor(anchor, context)).toEqual({
      message:
        'Sections only work in links to a document. Use a custom fragment like #team for a URL.',
      path: ['reference'],
    })
    expect(queries).toEqual([])
  })

  it('leaves custom fragments and missing sections alone', async () => {
    const {context} = await makeContext(dataset, {parent: {url: '/about'}, documentId: 'home'})
    expect(await validateLinkAnchor({}, context)).toBe(true)
    const missing = await makeContext(
      {},
      {parent: {reference: {_ref: 'page-2'}}, documentId: 'home'},
    )
    expect(await validateLinkAnchor(anchor, missing.context)).toBe(true)
  })
})
