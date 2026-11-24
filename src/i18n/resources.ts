/**
 * English (US) strings for the link picker. Translations can be provided by registering a bundle
 * for the same namespace with `defineLocaleResourceBundle`.
 */
const linkPickerResources = {
  /** Header shown while searching documents */
  'search.searching': 'Searching...',
  /** Number of results (exact) */
  'search.result-count_one': '{{count}} result',
  'search.result-count_other': '{{count}} results',
  /** Number of results when more can be loaded */
  'search.result-count-more': '{{count}}+ results',
  /** Shown when a search or document folder has no results */
  'search.no-results': 'No results',
  /** Button leaving a document folder */
  'folder.back': 'Back',
  /** Tooltip and accessible label for the button that replaces a selected reference */
  'reference.replace': 'Replace reference',
  /** Shown in place of a linked document that doesn't exist anymore */
  'reference.missing': 'Document not found',
  /** Accessible label for a URL shown as its preset route; clicking it edits the URL */
  'link.edit': 'Edit link',
  /** Tooltip and accessible label for the button that clears a preset, email or phone link */
  'link.replace': 'Replace link',
  /** Shown after the address of an email link displayed as a card */
  'link.email': 'Email',
  /** Shown after the number of a phone link displayed as a card */
  'link.phone': 'Phone',
  /** Header above the document an anchor field is on */
  'anchor.current-document': 'This document',
  /** Header above the sections of the document an anchor's link points to */
  'anchor.linked-sections': 'Sections on the linked page',
  /** Header above the other documents that have sections */
  'anchor.documents': 'Documents with sections',
  /** Picker option that stores the typed text as a custom fragment, e.g. `Use "#team"` */
  'anchor.use-fragment': 'Use "{{fragment}}"',
  /** Shown when a selected section's anchor document no longer exists */
  'anchor.missing': 'Section not found',
  /** Fallback for a document or section without a title */
  'anchor.untitled': 'Untitled',
  /** Picker hint inside a link to a URL, where only a custom fragment can be added */
  'anchor.fragment-only.url': 'This link goes to a URL. Type a fragment like #team to add one.',
  /** Picker hint inside a link to a document type without sections */
  'anchor.fragment-only.no-sections':
    "The linked document doesn't have sections. Type a fragment like #team to add one.",
  /** Shown in a document's sections list when it has no sections to pick yet */
  'anchor.no-sections': 'No sections yet. Sections can be picked once their page is published.',

  /** Validation: the link's URL isn't a supported link */
  'validation.invalid-url': 'Must be a path, query string, URL, email address, or phone number',
  /** Validation: the anchor's custom fragment isn't valid */
  'validation.invalid-anchor': 'Must be a fragment like #my-section, without spaces',
  /** Validation warning: the linked document was deleted */
  'validation.reference-missing': "The linked document doesn't exist anymore",
  /** Validation warning: the linked document only exists as a draft or in a release */
  'validation.reference-unpublished':
    "The linked document isn't published yet, so the link won't work until it is",
  /** Validation warning: the selected section was removed from its page, or its page deleted */
  'validation.section-missing': "This section doesn't exist anymore",
  /** Validation warning: a section was picked for a link that goes to a URL */
  'validation.anchor-needs-document':
    'Sections only work in links to a document. Use a custom fragment like #team for a URL.',
  /** Validation warning: the picked section is on another page than the link goes to */
  'validation.anchor-other-page': "This section isn't on the page this link goes to",
} as const

export default linkPickerResources
