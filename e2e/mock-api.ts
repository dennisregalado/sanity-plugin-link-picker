/**
 * A stand-in for the Content Lake, so the dev Studio runs in the browser tests without a project.
 * Queries are evaluated with groq-js over an in-memory dataset; listeners stay connected and
 * mutations are accepted without being applied.
 */

import type {Page, Route} from '@playwright/test'
import {evaluate, parse} from 'groq-js'

import {buildSectionAnchorDocuments} from '../src/anchors'

type Doc = {_id: string; _type: string; [field: string]: unknown}

const ORIGIN = 'http://localhost:3333'

const ref = (id: string) => ({_type: 'reference', _ref: id, _weak: true})

function buildDataset(): Doc[] {
  const meta = (doc: Doc): Doc => ({
    _createdAt: '2026-11-20T10:00:00Z',
    _updatedAt: '2026-11-20T10:00:00Z',
    _rev: 'r1',
    ...doc,
  })
  const pages: Doc[] = [
    {
      _id: 'page-about',
      _type: 'page',
      title: 'About us',
      slug: {current: 'about'},
      sections: [
        {_key: 's1', _type: 'hero', heading: 'Who we are'},
        {_key: 's2', _type: 'textSection', title: 'Our story'},
        {_key: 's3', _type: 'textSection', title: 'Meet the team'},
      ],
    },
    {
      _id: 'page-pricing',
      _type: 'page',
      title: 'Pricing',
      slug: {current: 'pricing'},
      sections: [
        {_key: 'p1', _type: 'hero', heading: 'Simple pricing'},
        {_key: 'p2', _type: 'textSection', title: 'Compare plans'},
      ],
    },
    {_id: 'page-contact', _type: 'page', title: 'Contact', slug: {current: 'contact'}},
    {_id: 'product-shoe', _type: 'product', title: 'Trail shoe', slug: {current: 'trail-shoe'}},
  ]
  const anchors = pages.flatMap((page) => buildSectionAnchorDocuments(page))

  const anchorDemo = (_id: string, title: string, link: object, extra: object = {}): Doc => ({
    _id,
    _type: 'anchorDemo',
    title,
    link: {_type: 'link', ...link},
    ...extra,
  })

  return [
    ...pages,
    ...anchors,
    {
      _id: 'link-demo',
      _type: 'linkDemo',
      title: 'Links',
      pathLink: {_type: 'link', label: 'Home', url: '/'},
      externalLink: {_type: 'link', label: 'Shop now', url: 'https://example.com/shop'},
      emailLink: {_type: 'link', label: 'Email us', url: 'mailto:hello@example.com'},
    },
    anchorDemo('anchor-picker', 'Pick an anchor', {label: 'About', reference: ref('page-about')}),
    anchorDemo('anchor-url', 'Link to a URL', {label: 'Docs', url: 'https://example.com/docs'}),
    anchorDemo('anchor-other-page', 'Section on another page', {
      label: 'About',
      reference: ref('page-about'),
      anchor: {_type: 'anchor', reference: ref('anchor-page-pricing-p2')},
    }),
    anchorDemo(
      'anchor-deleted',
      'Deleted targets',
      {label: 'Gone', reference: ref('page-deleted')},
      {jumpTo: {_type: 'anchor', reference: ref('anchor-page-about-gone')}},
    ),
  ].map(meta)
}

const USER = {
  id: 'p-e2e',
  name: 'Test Editor',
  email: 'editor@example.com',
  profileImage: null,
  role: 'administrator',
  roles: [{name: 'administrator', title: 'Administrator'}],
  provider: 'sanity',
}

const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  })
}

async function runQuery(dataset: Doc[], query: string, params: Record<string, unknown>) {
  // groq-js has no text::query(); approximate it with `match` on the usual text fields
  const rewritten = query
    .replace(
      /\[@, _id\] match text::query\((\$\w+)\)/g,
      '[title, heading, name, _id, slug.current] match $1',
    )
    .replace(/(\w[\w.]*) match text::query\((\$\w+)\)/g, '$1 match $2')
  const tree = parse(rewritten, {params})
  // The dataset only holds published documents, so no perspective is needed
  const value = await evaluate(tree, {dataset, params})
  return value.get()
}

function parseParams(search: URLSearchParams): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const [key, value] of search) {
    if (!key.startsWith('$')) continue
    try {
      params[key.slice(1)] = JSON.parse(value)
    } catch {
      params[key.slice(1)] = value
    }
  }
  return params
}

function getRequestQuery(route: Route): {query: string; params: Record<string, unknown>} {
  const request = route.request()
  if (request.method() === 'POST') {
    const body: unknown = JSON.parse(request.postData() || '{}')
    const query = body && typeof body === 'object' && 'query' in body ? body.query : ''
    const params = body && typeof body === 'object' && 'params' in body ? body.params : {}
    return {
      query: typeof query === 'string' ? query : '',
      params: params && typeof params === 'object' ? {...params} : {},
    }
  }
  const url = new URL(request.url())
  return {query: url.searchParams.get('query') ?? '', params: parseParams(url.searchParams)}
}

// Playwright can't hold a streamed response open, so listeners (EventSource, or a fetch stream)
// get a `welcome` event and then stay connected
const KEEP_LISTENERS_OPEN = `
(() => {
  const NativeEventSource = window.EventSource
  class OpenEventSource extends EventTarget {
    constructor(url, init) {
      super()
      if (!String(url).includes('/listen/')) return new NativeEventSource(url, init)
      this.url = String(url)
      this.readyState = 0
      this.withCredentials = Boolean(init && init.withCredentials)
      setTimeout(() => {
        this.readyState = 1
        const open = new Event('open')
        if (this.onopen) this.onopen(open)
        this.dispatchEvent(open)
        this.dispatchEvent(new MessageEvent('welcome', {data: '{"listenerName":"e2e"}'}))
      }, 50)
    }
    close() { this.readyState = 2 }
  }
  OpenEventSource.CONNECTING = 0
  OpenEventSource.OPEN = 1
  OpenEventSource.CLOSED = 2
  window.EventSource = OpenEventSource

  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url
    if (!url || !String(url).includes('/data/listen/')) return nativeFetch(input, init)
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: welcome\\ndata: {"listenerName":"e2e"}\\n\\n'))
        const signal = init && init.signal
        if (signal) {
          signal.addEventListener('abort', () => {
            try { controller.error(new DOMException('Aborted', 'AbortError')) } catch {}
          })
        }
      },
    })
    return Promise.resolve(new Response(body, {status: 200, headers: {'content-type': 'text/event-stream'}}))
  }
})()
`

/** Routes the page's Sanity API requests to the in-memory dataset. */
export async function mockContentLake(page: Page): Promise<void> {
  const dataset = buildDataset()
  await page.addInitScript(KEEP_LISTENERS_OPEN)
  await page.route(/sanity\.io|sanity\.work/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/v[\w-]+/, '')

    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      })
    }
    if (path === '/users/me') return json(route, USER)
    if (path.startsWith('/data/query/')) {
      const {query, params} = getRequestQuery(route)
      try {
        return json(route, {ms: 1, query, result: await runQuery(dataset, query, params)})
      } catch {
        return json(route, {ms: 1, query, result: null})
      }
    }
    if (path.startsWith('/data/doc/')) {
      const ids = (path.split('/').pop() ?? '').split(',').map(decodeURIComponent)
      const documents = dataset.filter((doc) => ids.includes(doc._id))
      return json(route, {
        documents,
        omitted: ids
          .filter((id) => !documents.some((doc) => doc._id === id))
          .map((id) => ({id, reason: 'existence'})),
      })
    }
    if (path.startsWith('/data/listen/')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: CORS,
        body: 'event: welcome\ndata: {"listenerName":"e2e"}\n\n',
      })
    }
    if (path.startsWith('/data/history/') && path.includes('/events/documents/')) {
      const ids = decodeURIComponent(path.split('/').pop() ?? '').split(',')
      return json(route, {events: Object.fromEntries(ids.map((id) => [id, []])), nextCursor: ''})
    }
    if (path.endsWith('/acl')) {
      return json(route, [
        {filter: '_id in path("**")', permissions: ['read', 'create', 'update', 'history']},
      ])
    }
    if (path.startsWith('/data/mutate/')) return json(route, {transactionId: 'tx', results: []})
    if (path.startsWith('/data/actions/')) return json(route, {transactionId: 'tx'})
    if (path.startsWith('/users/me/keyvalue') || path.endsWith('/user-applications')) {
      return json(route, [])
    }
    return json(route, path.includes('acl') || path.includes('grants') ? [] : {})
  })
}
