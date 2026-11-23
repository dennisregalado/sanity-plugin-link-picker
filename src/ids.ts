/**
 * The published id for a document id: `drafts.x` and `versions.<release>.x` both become `x`.
 * Same rules as Studio's own id handling, without depending on its internal `getPublishedId`.
 */
export function getPublishedDocumentId(id: string): string {
  if (id.startsWith('versions.')) return id.split('.').slice(2).join('.')
  if (id.startsWith('drafts.')) return id.slice('drafts.'.length)
  return id
}
