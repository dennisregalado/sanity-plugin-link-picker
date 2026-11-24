/**
 * Turns a queried link into an `href` on your frontend.
 *
 * This entry point imports nothing (no `sanity`, React or other helpers), so it adds only itself
 * to a frontend bundle.
 *
 * @packageDocumentation
 */

/**
 * A slug as queried: a string (`"slug": slug.current`) or a `slug` object (`slug`).
 *
 * @public
 */
export type QueriedSlug = string | {current?: string | null} | null | undefined

/**
 * A link's anchor as queried. Any of:
 *
 * - a fragment string, `"anchor": coalesce(anchor.url, "#" + anchor.reference->slug.current)`;
 * - `anchor {url, "slug": reference->slug.current}`;
 * - `anchor {url, reference->{slug}}`.
 *
 * @public
 */
export type QueriedAnchor =
  | string
  | {
      url?: string | null
      slug?: QueriedSlug
      reference?: {slug?: QueriedSlug} | null
    }
  | null
  | undefined

/**
 * A link as queried. `reference` is whatever your query projects for it (for example
 * `reference->{_type, slug}`); it's passed to `resolveReference` as is.
 *
 * @public
 */
export type QueriedLink<Reference = unknown> = {
  url?: string | null
  reference?: Reference | null
  anchor?: QueriedAnchor
}

/**
 * Options for {@link resolveLinkHref}.
 *
 * @public
 */
export type ResolveLinkHrefOptions<Reference = unknown> = {
  /**
   * The path of a linked document, for example `/about` for a page with the slug `about`. Return
   * `null` when the document can't be linked to (unpublished, or no route for its type): the
   * whole link then resolves to `null`, rather than to its anchor on the current page.
   */
  resolveReference?: (reference: Reference) => string | null | undefined
}

// The schemes and forms the link field stores. Values written through the API skip the Studio's
// validation, so anything else (`javascript:`, `data:`, `//host`) is refused.
const SAFE_URL = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i

const NO_FRAGMENT = /^(?:mailto|tel):/i

function slugText(slug: QueriedSlug): string | undefined {
  if (typeof slug === 'string') return slug
  return slug?.current ?? undefined
}

/**
 * The `#fragment` of a queried anchor, or `''` when there is none.
 *
 * @public
 */
export function getAnchorFragment(anchor: QueriedAnchor): string {
  const raw =
    typeof anchor === 'string'
      ? anchor
      : (anchor?.url ?? slugText(anchor?.slug) ?? slugText(anchor?.reference?.slug))
  const fragment = raw?.trim().replace(/^#+/, '')
  return fragment ? `#${fragment}` : ''
}

/**
 * The `href` for a queried link: its URL or its document's path, followed by its anchor's
 * `#fragment`. Returns `null` when there's nothing to link to, when a linked document can't be
 * resolved, or when the stored URL has an unsupported scheme.
 *
 * - An anchor replaces a `#fragment` already in the URL.
 * - `mailto:` and `tel:` links ignore anchors.
 * - A link with only an anchor resolves to the fragment (`#team`), a section on the current page.
 *
 * @example
 * ```ts
 * // link {url, reference->{_type, "slug": slug.current}, anchor {url, "slug": reference->slug.current}}
 * import {resolveLinkHref} from 'sanity-plugin-link-picker/resolve'
 *
 * const href = resolveLinkHref(link, {
 *   resolveReference: (ref) => (ref._type === 'page' && ref.slug ? `/${ref.slug}` : null),
 * })
 * // '/about#team'
 * ```
 *
 * @public
 */
export function resolveLinkHref<Reference = unknown>(
  link: QueriedLink<Reference> | null | undefined,
  options: ResolveLinkHrefOptions<Reference> = {},
): string | null {
  if (!link) return null

  let base = ''
  if (link.reference) {
    const path = options.resolveReference?.(link.reference)?.trim()
    if (!path) return null
    base = path
  } else if (link.url?.trim()) {
    base = link.url.trim()
  }

  if (base && !SAFE_URL.test(base)) return null
  if (NO_FRAGMENT.test(base)) return base

  const fragment = getAnchorFragment(link.anchor)
  if (!fragment) return base || null

  const hashIndex = base.indexOf('#')
  return `${hashIndex === -1 ? base : base.slice(0, hashIndex)}${fragment}`
}
