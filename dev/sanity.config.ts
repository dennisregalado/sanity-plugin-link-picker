import {BasketIcon} from '@sanity/icons/Basket'
import {HomeIcon} from '@sanity/icons/Home'
import {defineConfig, defineField} from 'sanity'
import {documents, group, linkPicker, route} from 'sanity-plugin-link-picker'
import {structureTool} from 'sanity/structure'

import {anchorSchemaTypes, schemaTypes} from './schema'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'missing-project-id'
const dataset = process.env.SANITY_STUDIO_DATASET || 'development'

const routes = [
  route('Home', '/', {icon: HomeIcon}),
  group('Shop', [
    route('All products', '/shop', {icon: BasketIcon}),
    // Emoji icons work too
    route('Gift cards', '/gift-cards', {icon: '🎁'}),
  ]),
  documents('Pages', 'page'),
  documents('Products', 'product'),
  documents('Collections', 'collection'),
]

const shared = {projectId, dataset, schema: {types: schemaTypes}}

export default defineConfig([
  {
    ...shared,
    name: 'default',
    title: 'Link picker',
    basePath: '/default',
    plugins: [structureTool(), linkPicker(routes)],
  },
  {
    ...shared,
    name: 'extras',
    title: 'Link picker (extra fields)',
    basePath: '/extras',
    plugins: [
      structureTool(),
      linkPicker(routes, {
        fields: [
          defineField({name: 'parameters', title: 'Parameters', type: 'string'}),
          defineField({name: 'anchor', title: 'Anchor', type: 'string'}),
        ],
      }),
    ],
  },
  {
    ...shared,
    name: 'anchors',
    title: 'Link picker (section anchors)',
    basePath: '/anchors',
    schema: {types: anchorSchemaTypes},
    plugins: [
      structureTool(),
      linkPicker(routes, {
        anchors: {documentTypes: ['page']},
        fields: [defineField({name: 'parameters', title: 'Parameters', type: 'string'})],
      }),
    ],
  },
])
