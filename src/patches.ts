import {type FormPatch, set, setIfMissing, unset} from 'sanity'

/**
 * The published id for a document id: `drafts.x` and `versions.<release>.x` both become `x`.
 * Same rules as Studio's own id handling, without depending on its internal `getPublishedId`.
 */
export function getPublishedDocumentId(id: string): string {
  if (id.startsWith('versions.')) return id.split('.').slice(2).join('.')
  if (id.startsWith('drafts.')) return id.slice('drafts.'.length)
  return id
}

/** An item chosen in the link picker. */
export interface LinkSelection {
  /** Suggested label. Applied when present; an existing label is never cleared. */
  label?: string
  /** A URL, path, `mailto:` or `tel:` value, stored in `url`. */
  href?: string
  /** A document id (possibly a draft or release version id), stored as a weak reference. */
  _id?: string
}

/**
 * Patches that apply a picker selection to a link value.
 *
 * Individual fields are patched rather than replacing the whole object, so custom `fields`, the
 * array `_key` and concurrent edits by other users are preserved. `url` and `reference` are
 * mutually exclusive: setting one unsets the other.
 */
export function buildSelectionPatches(typeName: string, selection: LinkSelection): FormPatch[] {
  const patches: FormPatch[] = [setIfMissing({_type: typeName})]

  if (selection.label) {
    patches.push(set(selection.label, ['label']))
  }

  if (selection._id) {
    patches.push(
      set(
        {
          _type: 'reference',
          // Search hits can be draft (`drafts.`) or release (`versions.`) ids; references must
          // always point at the published id.
          _ref: getPublishedDocumentId(selection._id),
          _weak: true,
        },
        ['reference'],
      ),
      unset(['url']),
    )
  } else if (selection.href) {
    patches.push(set(selection.href, ['url']), unset(['reference']))
  }

  return patches
}
