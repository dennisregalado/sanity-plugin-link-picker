import {type FormPatch, set, setIfMissing, unset} from 'sanity'

import {getPublishedDocumentId} from './ids'

export {getPublishedDocumentId}

/** The parts of the current link value that selection patches depend on. */
export type CurrentLinkValue = {
  reference?: {_ref?: string} | null
  anchor?: {url?: string | null; reference?: unknown} | null
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
 * mutually exclusive: setting one unsets the other. Pass the `current` value to also clear a
 * section anchor when the link starts pointing somewhere else.
 */
export function buildSelectionPatches(
  typeName: string,
  selection: LinkSelection,
  current?: CurrentLinkValue | null,
): FormPatch[] {
  const patches: FormPatch[] = [setIfMissing({_type: typeName})]

  // A section anchor belongs to the linked page: when the link points somewhere else, clear it.
  // A custom `#fragment` in `anchor.url` is kept.
  const nextRef = selection._id ? getPublishedDocumentId(selection._id) : undefined
  if (
    current?.anchor?.reference &&
    (selection._id || selection.href) &&
    nextRef !== current.reference?._ref
  ) {
    patches.push(unset(['anchor', 'reference']))
  }

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
