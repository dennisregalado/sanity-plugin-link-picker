import {defineArrayMember, defineField, defineType} from 'sanity'

/** Minimal stand-ins for the dataset's linkable types, so previews and search work. */
const linkable = ['page', 'product', 'collection'].map((name) =>
  defineType({
    name,
    type: 'document',
    fields: [
      defineField({name: 'title', type: 'string'}),
      defineField({name: 'slug', type: 'slug'}),
    ],
  }),
)

const REFERENCE_PAGE_ID = process.env.SANITY_STUDIO_DEMO_REFERENCE_ID || 'page-id'

/**
 * Every link state in one form. All filled-in states come from `initialValue`, so opening a new
 * `linkDemo` document never writes to the dataset until a value is actually edited.
 */
const linkDemo = defineType({
  name: 'linkDemo',
  title: 'Link demo',
  type: 'document',
  initialValue: {
    pathLink: {_type: 'link', label: 'About us', url: '/about'},
    externalLink: {_type: 'link', label: 'Shop now', url: 'https://example.com/shop'},
    emailLink: {_type: 'link', label: 'Email us', url: 'mailto:hello@example.com'},
    phoneLink: {_type: 'link', label: 'Call us', url: 'tel:+15555550123'},
    referenceLink: {
      _type: 'link',
      label: 'Featured page',
      reference: {_type: 'reference', _ref: REFERENCE_PAGE_ID, _weak: true},
    },
    ctaList: [
      {_type: 'link', _key: 'a', label: 'Shop now', url: '/shop'},
      {_type: 'link', _key: 'b', label: 'Contact', url: 'mailto:hello@example.com'},
    ],
    readOnlyLink: {_type: 'link', label: 'Locked', url: '/locked'},
  },
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'emptyLink', title: 'Empty link', type: 'link'}),
    defineField({name: 'pathLink', title: 'Path link', type: 'link'}),
    defineField({name: 'externalLink', title: 'External link', type: 'link'}),
    defineField({name: 'emailLink', title: 'Email link', type: 'link'}),
    defineField({name: 'phoneLink', title: 'Phone link', type: 'link'}),
    defineField({name: 'referenceLink', title: 'Reference link', type: 'link'}),
    defineField({
      name: 'ctaList',
      title: 'CTA list',
      type: 'array',
      of: [defineArrayMember({type: 'link'})],
    }),
    defineField({name: 'readOnlyLink', title: 'Read-only link', type: 'link', readOnly: true}),
  ],
})

export const schemaTypes = [...linkable, linkDemo]
