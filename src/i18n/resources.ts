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
} as const

export default linkPickerResources
