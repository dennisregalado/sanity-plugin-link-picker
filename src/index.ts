import {definePlugin, type PluginOptions} from 'sanity'

import {linkPickerUsEnglishLocaleBundle} from './i18n'
import type {LinkRouteDefinition, LinksPluginProps} from './routes'
import {createLinkType} from './schema'
import type {LinkFieldPluginOptions} from './types'

type LinkPickerConfig = {
  routes: LinkRouteDefinition[] | LinksPluginProps
  options: LinkFieldPluginOptions
}

const linkPickerPlugin = definePlugin<LinkPickerConfig>(({routes, options}) => ({
  name: 'sanity-plugin-link-picker',
  schema: {
    types: [createLinkType(routes, options)],
  },
  i18n: {
    bundles: [linkPickerUsEnglishLocaleBundle],
  },
}))

/**
 * A plugin that adds a custom Link field for creating internal and external links,
 * as well as `mailto` and `tel`-links, all using the same intuitive UI.
 *
 * @param routes - Link picker routes (static paths and document folders), or a menu from
 *   {@link defineLinkMenu}
 * @param options - Extra schema fields, icon, and preview. See {@link LinkFieldPluginOptions}
 *
 * @example Minimal example
 * ```ts
 * // sanity.config.ts
 * import { defineConfig } from 'sanity'
 * import { linkPicker } from 'sanity-plugin-link-picker'
 *
 * export default defineConfig({
 *  // ...
 *  plugins: [
 *    linkPicker()
 *  ]
 * })
 *
 * // mySchema.ts
 * import { defineField, defineType } from 'sanity';
 *
 * export const mySchema = defineType({
 *  // ...
 *  fields: [
 *    // ...
 *    defineField({
 *      name: 'link',
 *      title: 'Link',
 *      type: 'link'
 *    }),
 *  ]
 *});
 * ```
 *
 * @example With routes and options
 * ```ts
 * linkPicker(
 *   [
 *     route('Home', '/'),
 *     documents('Pages', 'page'),
 *   ],
 *   {
 *     fields: [
 *       defineField({ name: 'parameters', type: 'string' }),
 *     ],
 *   },
 * )
 * ```
 *
 * @public
 */
export function linkPicker(
  routes: LinkRouteDefinition[] | LinksPluginProps = [],
  options: LinkFieldPluginOptions = {},
): PluginOptions {
  return linkPickerPlugin({routes, options})
}

export {defineLinkMenu, documents, group, route} from './routes'
export type {
  LinkDocumentFolder,
  LinkIconInput,
  LinkRouteDefinition,
  LinkRouteGroup,
  LinksPluginProps,
  StaticLinkRoute,
} from './routes'
export {
  linkPickerLocaleNamespace,
  linkPickerUsEnglishLocaleBundle,
  type LinkPickerLocaleResourceKeys,
} from './i18n'
export type {
  LinkDefinition,
  LinkFieldOptions,
  LinkFieldPluginOptions,
  LinkInputProps,
  LinkReferenceValue,
  LinkSchemaType,
  LinkValue,
} from './types'
