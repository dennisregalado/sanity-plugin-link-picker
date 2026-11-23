/**
 * Section anchors: pure helpers shared by the Studio plugin, the Sanity Function that keeps
 * anchor documents in sync, and frontends that render section ids.
 *
 * This entry point has no dependency on `sanity` or React, so it is safe to import from a Sanity
 * Function or a frontend.
 *
 * @packageDocumentation
 */

import {getPublishedDocumentId} from '../ids'

/**
 * The document type the anchors Function writes, one document per section.
 *
 * @public
 */
export const SECTION_ANCHOR_TYPE = 'sectionAnchor'

/**
 * The array field on a document that holds its sections.
 *
 * @public
 */
export const DEFAULT_SECTIONS_FIELD = 'sections'

const MAX_SLUG_LENGTH = 96

/** Sanity document ids may use letters, digits, `_`, `-` and `.`, up to 128 characters. */
const MAX_ID_LENGTH = 128

const ID_PREFIX = 'anchor-'

const TITLE_FIELDS = ['heading', 'title', 'name', 'label'] as const

/**
 * A section in a document's sections array, as stored. Only `_key` is required.
 *
 * @public
 */
export type SectionValue = {
  _key?: string
  _type?: string
  [field: string]: unknown
}

/**
 * Returns a section's heading text, or `undefined` when it has none.
 *
 * @public
 */
export type GetSectionTitle = (section: SectionValue) => string | undefined

/**
 * An anchor derived from a section.
 *
 * @public
 */
export type SectionAnchor = {
  /** The section's `_key`. */
  key: string
  /** The section's heading. */
  title: string
  /** URL fragment without `#`, unique within the document. */
  slug: string
  /** The section's position in the document. */
  order: number
}

/**
 * Options for {@link getSectionAnchors}.
 *
 * @public
 */
export type SectionAnchorOptions = {
  /**
   * Reads a section's heading. Defaults to the first string among `heading`, `title`, `name`
   * and `label` (Portable Text blocks in those fields are read as plain text). Sections without
   * a heading get no anchor.
   */
  getTitle?: GetSectionTitle
}

/**
 * Turns a heading into a URL fragment: lowercase ASCII letters, digits and dashes.
 *
 * @example
 * ```ts
 * slugify('Meet the Team!') // 'meet-the-team'
 * slugify('Café & Bar') // 'cafe-bar'
 * ```
 *
 * @public
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '')
}

/** Plain text of a string or an array of Portable Text blocks. */
function toPlainText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined

  const text = value
    .flatMap((block: unknown) => {
      if (!block || typeof block !== 'object' || !('children' in block)) return []
      const children: unknown = block.children
      if (!Array.isArray(children)) return []
      return [
        children
          .map((child: unknown) =>
            child && typeof child === 'object' && 'text' in child && typeof child.text === 'string'
              ? child.text
              : '',
          )
          .join(''),
      ]
    })
    .join(' ')

  return text || undefined
}

/**
 * The default {@link GetSectionTitle}: the first non-empty `heading`, `title`, `name` or `label`.
 *
 * @public
 */
export const getDefaultSectionTitle: GetSectionTitle = (section) => {
  for (const field of TITLE_FIELDS) {
    const text = toPlainText(section[field])?.trim()
    if (text) return text
  }
  return undefined
}

/**
 * Anchors for a document's sections, in order. Slugs come from each section's heading and are
 * made unique within the document (`features`, `features-2`, …). Sections without a `_key` or a
 * heading are skipped.
 *
 * Use the same function on your frontend to render matching `id` attributes:
 *
 * @example
 * ```tsx
 * const anchors = new Map(getSectionAnchors(page.sections).map((a) => [a.key, a.slug]))
 * page.sections.map((section) => <section id={anchors.get(section._key)} key={section._key} />)
 * ```
 *
 * @public
 */
export function getSectionAnchors(
  sections: unknown,
  options: SectionAnchorOptions = {},
): SectionAnchor[] {
  if (!Array.isArray(sections)) return []
  const {getTitle = getDefaultSectionTitle} = options
  const used = new Set<string>()
  const anchors: SectionAnchor[] = []

  sections.forEach((section: unknown, order) => {
    if (!isSection(section)) return
    const title = getTitle(section)?.trim()
    if (!title) return

    const base = slugify(title) || 'section'
    let slug = base
    for (let suffix = 2; used.has(slug); suffix++) slug = `${base}-${suffix}`
    used.add(slug)

    anchors.push({key: section._key, title, slug, order})
  })

  return anchors
}

function isSection(value: unknown): value is SectionValue & {_key: string} {
  return Boolean(
    value &&
    typeof value === 'object' &&
    '_key' in value &&
    typeof value._key === 'string' &&
    value._key,
  )
}

/**
 * The id of the anchor document for a section. Deterministic, so syncing is idempotent and
 * references survive heading (slug) changes.
 *
 * @public
 */
export function getAnchorDocumentId(parentId: string, sectionKey: string): string {
  const safe = (value: string) => value.replace(/[^\w-]/g, '_')
  return `${ID_PREFIX}${safe(parentId)}-${safe(sectionKey)}`.slice(0, MAX_ID_LENGTH)
}

/**
 * A stored anchor document.
 *
 * @public
 */
export type SectionAnchorDocument = {
  _id: string
  _type: typeof SECTION_ANCHOR_TYPE
  title: string
  slug: {_type: 'slug'; current: string}
  parent: {_type: 'reference'; _ref: string; _weak: true}
  sectionKey: string
  order: number
}

/**
 * The anchor documents a document's sections should have.
 *
 * @public
 */
export function buildSectionAnchorDocuments(
  document: {_id: string; [field: string]: unknown},
  options: SectionAnchorOptions & {field?: string} = {},
): SectionAnchorDocument[] {
  const {field = DEFAULT_SECTIONS_FIELD, ...anchorOptions} = options
  const parentId = getPublishedDocumentId(document._id)

  return getSectionAnchors(document[field], anchorOptions).map((anchor) => ({
    _id: getAnchorDocumentId(parentId, anchor.key),
    _type: SECTION_ANCHOR_TYPE,
    title: anchor.title,
    slug: {_type: 'slug', current: anchor.slug},
    parent: {_type: 'reference', _ref: parentId, _weak: true},
    sectionKey: anchor.key,
    order: anchor.order,
  }))
}

/**
 * The subset of a `@sanity/client` transaction that {@link syncSectionAnchors} uses.
 *
 * @public
 */
export interface SectionAnchorTransaction {
  createOrReplace(document: SectionAnchorDocument): SectionAnchorTransaction
  delete(documentId: string): SectionAnchorTransaction
  commit(options?: {visibility?: 'sync' | 'async' | 'deferred'; tag?: string}): Promise<unknown>
}

/**
 * The subset of a `@sanity/client` client that {@link syncSectionAnchors} uses. A client from
 * `createClient()` satisfies it.
 *
 * @public
 */
export interface SectionAnchorClient {
  fetch<R = unknown>(query: string, params: Record<string, unknown>): Promise<R>
  transaction(): SectionAnchorTransaction
}

/**
 * Options for {@link syncSectionAnchors}.
 *
 * @public
 */
export type SyncSectionAnchorsOptions = SectionAnchorOptions & {
  /** The sections array field. Defaults to `sections`. */
  field?: string
  /**
   * The event that triggered the sync. On `delete`, all of the document's anchors are removed.
   * Defaults to `document.operation`, as set by the projection
   * `{..., "operation": delta::operation()}`.
   */
  operation?: 'create' | 'update' | 'delete'
  /** Compute changes without writing them, e.g. when testing the Function locally. */
  dryRun?: boolean
}

/**
 * What {@link syncSectionAnchors} changed.
 *
 * @public
 */
export type SyncSectionAnchorsResult = {
  /** Anchor documents created or updated. */
  upserted: string[]
  /** Anchor documents deleted. */
  deleted: string[]
  /** Set when the document was ignored (drafts and release versions). */
  skipped?: 'draft'
}

type ExistingAnchor = Omit<SectionAnchorDocument, 'slug' | 'parent'> & {
  slug?: {current?: string}
  parent?: {_ref?: string}
}

/**
 * Creates, updates and deletes a document's `sectionAnchor` documents to match its sections.
 * Call it from a Sanity Function on document create, update and delete events.
 *
 * Only published documents are synced. Unchanged anchors are not rewritten.
 *
 * @example
 * ```ts
 * // functions/section-anchors/index.ts
 * import {createClient} from '@sanity/client'
 * import {documentEventHandler} from '@sanity/functions'
 * import {syncSectionAnchors} from 'sanity-plugin-link-picker/anchors'
 *
 * export const handler = documentEventHandler(async ({context, event}) => {
 *   const client = createClient({...context.clientOptions, apiVersion: '2025-05-08', useCdn: false})
 *   await syncSectionAnchors(client, event.data, {dryRun: context.local})
 * })
 * ```
 *
 * @public
 */
export async function syncSectionAnchors(
  client: SectionAnchorClient,
  document: {_id: string; operation?: string; [field: string]: unknown},
  options: SyncSectionAnchorsOptions = {},
): Promise<SyncSectionAnchorsResult> {
  const {dryRun = false, operation = document.operation, ...buildOptions} = options

  if (document._id.startsWith('drafts.') || document._id.startsWith('versions.')) {
    return {upserted: [], deleted: [], skipped: 'draft'}
  }

  const desired = operation === 'delete' ? [] : buildSectionAnchorDocuments(document, buildOptions)
  const existing = await client.fetch<ExistingAnchor[]>(
    `*[_type == $type && parent._ref == $parentId]{_id, _type, title, slug, parent, sectionKey, order}`,
    {type: SECTION_ANCHOR_TYPE, parentId: document._id},
  )

  const existingById = new Map(existing.map((anchor) => [anchor._id, anchor]))
  const desiredIds = new Set(desired.map((anchor) => anchor._id))
  const upserts = desired.filter((anchor) => !isSameAnchor(existingById.get(anchor._id), anchor))
  const deletes = existing.map((anchor) => anchor._id).filter((id) => !desiredIds.has(id))

  if (!dryRun && (upserts.length > 0 || deletes.length > 0)) {
    let transaction = client.transaction()
    for (const anchor of upserts) transaction = transaction.createOrReplace(anchor)
    for (const id of deletes) transaction = transaction.delete(id)
    await transaction.commit({visibility: 'async', tag: 'link-picker.section-anchors'})
  }

  return {upserted: upserts.map((anchor) => anchor._id), deleted: deletes}
}

function isSameAnchor(current: ExistingAnchor | undefined, next: SectionAnchorDocument): boolean {
  return Boolean(
    current &&
    current.title === next.title &&
    current.slug?.current === next.slug.current &&
    current.parent?._ref === next.parent._ref &&
    current.sectionKey === next.sectionKey &&
    current.order === next.order,
  )
}
