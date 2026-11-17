import {defineLocaleResourceBundle} from 'sanity'

import linkPickerResources from './resources'

/**
 * The i18n namespace for the link picker's strings.
 *
 * @public
 */
export const linkPickerLocaleNamespace = 'sanity-plugin-link-picker' as const

/**
 * The default (US English) strings for the link picker, registered by the plugin. Strings are
 * small, so they are bundled rather than loaded lazily.
 *
 * @public
 */
export const linkPickerUsEnglishLocaleBundle = defineLocaleResourceBundle({
  locale: 'en-US',
  namespace: linkPickerLocaleNamespace,
  resources: linkPickerResources,
})

/**
 * Keys of the link picker's locale resources.
 *
 * @public
 */
export type LinkPickerLocaleResourceKeys = keyof typeof linkPickerResources
