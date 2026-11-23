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
} as const

export default linkPickerResources
