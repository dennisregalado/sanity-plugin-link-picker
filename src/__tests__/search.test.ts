import type {SchemaType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {buildDocumentSearchQuery, prefixLast} from '../search'

const schemaType = (name: string, select?: Record<string, string>) =>
  ({name, preview: select ? {select} : undefined}) as unknown as SchemaType

describe('prefixLast', () => {
  it.each([
    ['tote', 'tote*'],
    ['tote bag', 'tote bag*'],
    ['  tote   bag  ', 'tote bag*'],
    ['tote*', 'tote*'],
    ['tote -leather', 'tote* -leather'],
    ['"exact phrase"', '"exact phrase"'],
    ['', '*'],
  ])('%j -> %j', (input, expected) => {
    expect(prefixLast(input)).toBe(expected)
  })
})

describe('buildDocumentSearchQuery', () => {
  it('browses a folder newest first, with the folder filter', () => {
    const {query, params} = buildDocumentSearchQuery({
      mode: 'browse',
      query: '',
      typeNames: ['page'],
      schemaTypes: [schemaType('page')],
      filter: 'featured == $featured',
      filterParams: {featured: true},
    })
    expect(query).toBe(
      '*[_type in $__types && (featured == $featured)] | order(_updatedAt desc) [$__start...$__end] {_id, _type, _originalId}',
    )
    expect(params).toEqual({featured: true, __types: ['page']})
  })

  it('ranks search results, boosting preview title and subtitle fields', () => {
    const {query, params} = buildDocumentSearchQuery({
      mode: 'search',
      query: 'tote bag',
      typeNames: ['product'],
      schemaTypes: [schemaType('product', {title: 'title', subtitle: 'store.slug.current'})],
    })
    expect(query).toContain('[@, _id] match text::query($__query)')
    expect(query).toContain('boost(_type == "product" && title match text::query($__query), 10)')
    expect(query).toContain(
      'boost(_type == "product" && store.slug.current match text::query($__query), 5)',
    )
    expect(query).toContain('| order(_score desc, _updatedAt desc)')
    expect(params).toEqual({__types: ['product'], __query: 'tote bag*', __rawQuery: 'tote bag'})
  })

  it('never interpolates unsafe preview paths or type names into GROQ', () => {
    const {query} = buildDocumentSearchQuery({
      mode: 'search',
      query: 'x',
      typeNames: ['page'],
      schemaTypes: [
        schemaType('page', {title: 'title] | delete'}),
        schemaType('bad"name', {title: 'title'}),
        undefined,
      ],
    })
    expect(query).not.toContain('delete')
    expect(query).not.toContain('bad"name')
  })
})
