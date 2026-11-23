import type {QueryParams, SchemaType} from 'sanity'

/** Documents fetched per page in the picker. */
export const SEARCH_PAGE_SIZE = 25

const PREVIEW_FIELD_WEIGHTS: Record<string, number> = {title: 10, subtitle: 5, description: 1.5}

// Schema names and attribute paths are interpolated into GROQ, so only allow plain identifiers.
const SAFE_NAME = /^[A-Za-z_][\w.-]*$/
const SAFE_PATH = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/
const TOKEN_REGEX = /(?:[^\s"]+|"[^"]*")+/g

/** The parts of a schema type the search reads. */
export type SearchSchemaType = Pick<SchemaType, 'name' | 'preview'>

const DEFAULT_PROJECTION = '{_id, _type, _originalId}'

/** How a browsed folder is sorted. */
export type DocumentBrowseSort = 'updated' | 'order'

const BROWSE_ORDER: Record<DocumentBrowseSort, string> = {
  updated: 'order(_updatedAt desc)',
  order: 'order(order asc, _updatedAt desc)',
}

export interface DocumentSearchRequest {
  query: string
  params: QueryParams
}

/**
 * Makes the last plain word of a search a prefix match (`tote bag` -> `tote bag*`), so results
 * update while typing. Same behaviour as Studio's built-in search.
 */
export function prefixLast(query: string): string {
  const tokens = (query.match(TOKEN_REGEX) ?? []).map((token) => token.trim())
  if (tokens.length === 0) return '*'

  const index = tokens.findLastIndex(
    (token) => !token.startsWith('-') && !(token.startsWith('"') && token.endsWith('"')),
  )
  const token = tokens[index]
  if (token === undefined || token.endsWith('*')) return tokens.join(' ')

  return tokens.toSpliced(index, 1, `${token}*`).join(' ')
}

/**
 * Score boosts for a type's preview `title`/`subtitle`/`description` fields, mirroring how
 * Studio's search ranks documents whose preview text matches.
 */
function getPreviewBoosts(schemaType: SearchSchemaType | undefined): string[] {
  const select = schemaType?.preview?.select
  if (!schemaType || !select || !SAFE_NAME.test(schemaType.name)) return []

  return Object.entries(PREVIEW_FIELD_WEIGHTS).flatMap(([key, weight]) => {
    const path = select[key]
    if (typeof path !== 'string' || !SAFE_PATH.test(path)) return []
    return [
      `boost(_type == ${JSON.stringify(schemaType.name)} && ${path} match text::query($__query), ${weight})`,
    ]
  })
}

/**
 * Builds the GROQ query for the picker's document search (`mode: 'search'`) or for browsing a
 * document folder (`mode: 'browse'`, newest first unless `sort` says otherwise). Uses only public GROQ, so it is not tied to
 * Studio internals. Run it with the Studio's perspective so `_id` is the published id and drafts
 * or release versions are resolved.
 *
 * The caller passes `$__start` and `$__end` to page through results.
 */
export function buildDocumentSearchQuery(options: {
  mode: 'search' | 'browse'
  query: string
  schemaTypes: (SearchSchemaType | undefined)[]
  typeNames: string[]
  filter?: string
  filterParams?: QueryParams
  /** Browse order: newest first (default), or by the documents' `order` field. */
  sort?: DocumentBrowseSort
  /** Fields returned per document. Defaults to `{_id, _type, _originalId}`. */
  projection?: string
}): DocumentSearchRequest {
  const {
    mode,
    query,
    schemaTypes,
    typeNames,
    filter,
    filterParams,
    sort = 'updated',
    projection = DEFAULT_PROJECTION,
  } = options
  const constraints = ['_type in $__types']
  if (filter) constraints.push(`(${filter})`)

  const params: QueryParams = {...filterParams, __types: typeNames}
  const slice = '[$__start...$__end]'

  if (mode === 'browse') {
    return {
      query: `*[${constraints.join(' && ')}] | ${BROWSE_ORDER[sort]} ${slice} ${projection}`,
      params,
    }
  }

  const baseMatch =
    '([@, _id] match text::query($__query) || _id in string::split($__rawQuery, "/"))'
  const boosts = [...schemaTypes.flatMap(getPreviewBoosts), '[@, _id] match text::query($__query)']

  return {
    query: [
      `*[${[...constraints, baseMatch].join(' && ')}]`,
      `| score(${boosts.join(', ')})`,
      '| order(_score desc, _updatedAt desc)',
      `${slice} ${projection}`,
    ].join(' '),
    params: {...params, __query: prefixLast(query), __rawQuery: query},
  }
}
