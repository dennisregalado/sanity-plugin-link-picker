import {HashIcon} from '@sanity/icons/Hash'
import {defineField, defineType, type ObjectInputProps} from 'sanity'

import {AnchorInput} from './anchor-input'
import {SECTION_ANCHOR_TYPE} from './anchors'
import {isAnchorHref, normalizeLinkHref} from './href'
import {LinkInput} from './input'
import {
  getReferenceTypesFromRoutes,
  type LinkRouteDefinition,
  type LinksPluginProps,
} from './routes'
import type {
  AnchorInputProps,
  AnchorPluginOptions,
  LinkFieldPluginOptions,
  LinkInputProps,
} from './types'

const INVALID_URL_MESSAGE = 'Must be a path, query string, URL, email address, or phone number'

const INVALID_ANCHOR_MESSAGE = 'Must be a fragment like #my-section, without spaces'

function resolveRoutes(routes: LinkRouteDefinition[] | LinksPluginProps): LinkRouteDefinition[] {
  return Array.isArray(routes) ? routes : routes.routes
}

function isLinkInputProps(props: ObjectInputProps): props is LinkInputProps {
  // The input is only ever registered on the `link` object type, whose value is a LinkValue
  return props.schemaType.jsonType === 'object'
}

function isAnchorInputProps(
  props: ObjectInputProps,
): props is Omit<AnchorInputProps, 'pluginOptions'> {
  // The input is only ever registered on the `anchor` object type, whose value is an AnchorValue
  return props.schemaType.jsonType === 'object'
}

type LinkPreviewSelection = {
  label?: string
  url?: string
  anchorUrl?: string
  anchorSlug?: string
}

/** `#fragment` of a link's anchor, from its custom `url` or its section's slug. */
function getAnchorHash({anchorUrl, anchorSlug}: LinkPreviewSelection): string {
  if (anchorUrl) return anchorUrl
  return anchorSlug ? `#${anchorSlug}` : ''
}

/** Builds the `link` object type registered by the plugin. */
export function createLinkType(
  routes: LinkRouteDefinition[] | LinksPluginProps,
  options: LinkFieldPluginOptions,
) {
  const {icon, preview, fields = [], anchors} = options
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
        ...(anchors ? {anchorUrl: 'anchor.url', anchorSlug: 'anchor.reference.slug.current'} : {}),
      },
      prepare: (selection: LinkPreviewSelection) => {
        const href = `${selection.url ?? ''}${getAnchorHash(selection)}` || undefined
        return {
          title: selection.label || href,
          subtitle: selection.label ? href : undefined,
        }
      },
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
      ...(anchors
        ? [
            defineField({
              name: 'anchor',
              title: 'Anchor',
              type: 'anchor',
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

/** Builds the `anchor` object type: a custom `#fragment` or a reference to a section. */
export function createAnchorType(options: AnchorPluginOptions) {
  const pluginOptions = {documentTypes: options.documentTypes}

  return defineType({
    name: 'anchor',
    title: 'Anchor',
    type: 'object',
    icon: HashIcon,
    preview: {
      select: {
        url: 'url',
        section: 'reference.title',
        slug: 'reference.slug.current',
        parentTitle: 'reference.parent.title',
      },
      prepare: ({
        url,
        section,
        slug,
        parentTitle,
      }: {
        url?: string
        section?: string
        slug?: string
        parentTitle?: string
      }) => ({
        title: section || url || (slug ? `#${slug}` : undefined),
        subtitle: section
          ? [parentTitle, slug && `#${slug}`].filter(Boolean).join(' › ')
          : undefined,
      }),
    },
    fields: [
      defineField({
        name: 'url',
        title: 'URL',
        type: 'string',
        placeholder: 'Search sections or type #my-section',
        validation: (rule) =>
          rule.custom((value) => {
            if (!value || isAnchorHref(value)) return true
            return {'en-US': INVALID_ANCHOR_MESSAGE}
          }),
      }),
      defineField({
        name: 'reference',
        title: 'Section',
        type: 'reference',
        weak: true,
        options: {disableNew: true},
        to: [{type: SECTION_ANCHOR_TYPE}],
      }),
    ],
    components: {
      input: (props: ObjectInputProps) =>
        isAnchorInputProps(props) ? (
          <AnchorInput {...props} pluginOptions={pluginOptions} />
        ) : (
          props.renderDefault(props)
        ),
    },
  })
}

/**
 * Builds the `sectionAnchor` document type. Its documents are written by the anchors Function
 * (`syncSectionAnchors`), one per section, and are read-only in Studio.
 */
export function createSectionAnchorType(options: AnchorPluginOptions) {
  return defineType({
    name: SECTION_ANCHOR_TYPE,
    title: 'Section anchor',
    type: 'document',
    icon: HashIcon,
    readOnly: true,
    liveEdit: true,
    // Kept out of Studio's global search; they're picked through anchor fields
    __experimental_omnisearch_visibility: false,
    preview: {
      select: {
        title: 'title',
        slug: 'slug.current',
        parentTitle: 'parent.title',
      },
      prepare: ({
        title,
        slug,
        parentTitle,
      }: {
        title?: string
        slug?: string
        parentTitle?: string
      }) => ({
        title,
        subtitle: [parentTitle, slug && `#${slug}`].filter(Boolean).join(' › '),
      }),
    },
    fields: [
      defineField({name: 'title', title: 'Title', type: 'string'}),
      defineField({name: 'slug', title: 'Slug', type: 'slug'}),
      defineField({
        name: 'parent',
        title: 'Document',
        type: 'reference',
        weak: true,
        to: options.documentTypes.map((type) => ({type})),
      }),
      defineField({name: 'sectionKey', title: 'Section key', type: 'string'}),
      defineField({name: 'order', title: 'Order', type: 'number'}),
    ],
  })
}
