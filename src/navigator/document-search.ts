import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient, usePerspective, useSchema, useTranslation, type QueryParams} from 'sanity'

import {API_VERSION} from '../constants'
import {buildDocumentSearchQuery, type DocumentBrowseSort, SEARCH_PAGE_SIZE} from '../search'
import {SEARCH_DEBOUNCE_MS} from './constants'
import type {SearchDocument} from './types'

type DocumentSearchOptions = {
  debounceMs?: number
  filter?: string
  filterParams?: QueryParams
  /** `browse` lists a folder (newest first by default) instead of ranking by a search query. */
  mode?: 'search' | 'browse'
  /** Browse order */
  sort?: DocumentBrowseSort
  projection?: string
}

type Subscription = {unsubscribe: () => void}

export function formatResultCount(
  t: ReturnType<typeof useTranslation>['t'],
  count: number,
  hasMore: boolean,
): string {
  return hasMore ? t('search.result-count-more', {count}) : t('search.result-count', {count})
}

/** Pages fetch one extra row to know whether another page exists. */
function toPage(rows: SearchDocument[]) {
  return {hits: rows.slice(0, SEARCH_PAGE_SIZE), hasNextPage: rows.length > SEARCH_PAGE_SIZE}
}

type DocumentSearchState = {
  /** Identifies the request these results belong to, so stale results are never shown. */
  key: string | null
  hits: SearchDocument[]
  hasNextPage: boolean
  loadingMore: boolean
}

const EMPTY_SEARCH_STATE: DocumentSearchState = {
  key: null,
  hits: [],
  hasNextPage: false,
  loadingMore: false,
}

export function useDocumentSearch(
  query: string,
  documentTypes: string[],
  options: DocumentSearchOptions = {},
) {
  const {
    debounceMs = SEARCH_DEBOUNCE_MS,
    filter,
    filterParams,
    mode = 'search',
    sort,
    projection,
  } = options
  const client = useClient({apiVersion: API_VERSION})
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()

  const request = useMemo(() => {
    if (documentTypes.length === 0 || (mode === 'search' && !query)) return null
    return buildDocumentSearchQuery({
      mode,
      query,
      typeNames: documentTypes,
      schemaTypes: documentTypes.map((name) => schema.get(name)),
      filter,
      filterParams,
      sort,
      projection,
    })
  }, [documentTypes, filter, filterParams, mode, projection, query, schema, sort])
  const requestKey = request ? JSON.stringify([request, perspectiveStack]) : null

  const fetchPage = useCallback(
    (start: number) => {
      if (!request) return null
      return client.observable.fetch<SearchDocument[]>(
        request.query,
        {...request.params, __start: start, __end: start + SEARCH_PAGE_SIZE + 1},
        {perspective: perspectiveStack, tag: 'link-picker.search'},
      )
    },
    [client, perspectiveStack, request],
  )

  const [state, setState] = useState<DocumentSearchState>(EMPTY_SEARCH_STATE)
  const loadMoreSubscription = useRef<Subscription | null>(null)

  useEffect(() => {
    const page$ = fetchPage(0)
    if (!page$) return undefined

    let subscription: Subscription | undefined
    const run = () => {
      subscription = page$.subscribe({
        next: (rows) => setState({key: requestKey, ...toPage(rows), loadingMore: false}),
        error: () => setState({...EMPTY_SEARCH_STATE, key: requestKey}),
      })
    }
    const timer = debounceMs > 0 ? window.setTimeout(run, debounceMs) : undefined
    if (timer === undefined) run()

    return () => {
      window.clearTimeout(timer)
      subscription?.unsubscribe()
      loadMoreSubscription.current?.unsubscribe()
    }
  }, [debounceMs, fetchPage, requestKey])

  const isCurrent = requestKey !== null && state.key === requestKey
  const hits = isCurrent ? state.hits : EMPTY_HITS

  const loadMore = useCallback(() => {
    if (!isCurrent || !state.hasNextPage || state.loadingMore) return
    const page$ = fetchPage(state.hits.length)
    if (!page$) return

    setState((previous) => ({...previous, loadingMore: true}))
    loadMoreSubscription.current?.unsubscribe()
    loadMoreSubscription.current = page$.subscribe({
      next: (rows) => {
        const page = toPage(rows)
        setState((previous) =>
          previous.key === requestKey
            ? {
                key: requestKey,
                hits: uniqueById([...previous.hits, ...page.hits]),
                hasNextPage: page.hasNextPage,
                loadingMore: false,
              }
            : previous,
        )
      },
      error: () => setState((previous) => ({...previous, loadingMore: false})),
    })
  }, [fetchPage, isCurrent, requestKey, state.hasNextPage, state.hits.length, state.loadingMore])

  return {
    hits,
    loading: requestKey !== null && !isCurrent,
    loadingMore: isCurrent && state.loadingMore,
    hasNextPage: isCurrent && state.hasNextPage,
    loadMore,
  }
}

const EMPTY_HITS: SearchDocument[] = []

function uniqueById(documents: SearchDocument[]): SearchDocument[] {
  const seen = new Set<string>()
  return documents.filter((document) => !seen.has(document._id) && Boolean(seen.add(document._id)))
}
