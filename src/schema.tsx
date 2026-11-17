import {defineField, defineType, type ObjectInputProps} from 'sanity'

import {normalizeLinkHref} from './href'
import {LinkInput} from './input'
import {
  getReferenceTypesFromRoutes,
  type LinkRouteDefinition,
  type LinksPluginProps,
} from './routes'
import type {LinkFieldPluginOptions, LinkInputProps} from './types'

const INVALID_URL_MESSAGE = 'Must be a path, query string, URL, email address, or phone number'

function resolveRoutes(routes: LinkRouteDefinition[] | LinksPluginProps): LinkRouteDefinition[] {
  return Array.isArray(routes) ? routes : routes.routes
}

function isLinkInputProps(props: ObjectInputProps): props is LinkInputProps {
  // The input is only ever registered on the `link` object type, whose value is a LinkValue
  return props.schemaType.jsonType === 'object'
}

/** Builds the `link` object type registered by the plugin. */
export function createLinkType(
  routes: LinkRouteDefinition[] | LinksPluginProps,
  options: LinkFieldPluginOptions,
) {
  const {icon, preview, fields = []} = options
  const referenceTypes = getReferenceTypesFromRoutes(resolveRoutes(routes))
  const pluginOptions = {routes}

  return defineType({
    name: 'link',
    title: 'Link',
    type: 'object',
    icon,
    preview: preview || {
      select: {
        label: 'label',
        url: 'url',
      },
      prepare: ({label, url}: {label?: string; url?: string}) => ({
        title: label || url,
        subtitle: label ? url : undefined,
      }),
    },
    fields: [
      defineField({
        name: 'label',
        title: 'Label',
        type: 'string',
        placeholder: 'e.g. Shop now',
      }),
      defineField({
        name: 'url',
        title: 'URL',
        type: 'string',
        placeholder: 'Search or paste a link',
        validation: (rule) =>
          rule.custom((value) => {
            if (!value || value.trim().startsWith('?') || normalizeLinkHref(value)) {
              return true
            }

            return {'en-US': INVALID_URL_MESSAGE}
          }),
      }),
      ...(referenceTypes.length
        ? [
            defineField({
              name: 'reference',
              title: 'Reference',
              type: 'reference',
              weak: true,
              options: {
                disableNew: true,
              },
              to: referenceTypes.map((type) => ({type})),
            }),
          ]
        : []),
      ...fields,
    ],
    components: {
      input: (props: ObjectInputProps) =>
        isLinkInputProps(props) ? (
          <LinkInput {...props} pluginOptions={pluginOptions} />
        ) : (
          props.renderDefault(props)
        ),
    },
  })
}
