import {describe, expect, it, vi} from 'vitest'

import {
  applyReferenceTypes,
  defineLinkMenu,
  documents,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  getReferenceTypesFromSchemaType,
  group,
  route,
} from '../routes'

const routes = [
  route('Home', '/'),
  group('Shop', [route('All', '/shop'), documents('Products', 'product')]),
  documents('Pages', 'page'),
  documents('More pages', 'page', {filter: 'featured == true'}),
]

describe('route helpers', () => {
  it('builds route definitions', () => {
    expect(route('Home', '/', {icon: '🏠'})).toEqual({
      type: 'route',
      title: 'Home',
      path: '/',
      icon: '🏠',
    })
    expect(documents('Pages', 'page')).toEqual({
      type: 'documents',
      title: 'Pages',
      documentType: 'page',
    })
    expect(group('G', [])).toEqual({type: 'group', title: 'G', routes: []})
  })

  it('flattens static routes through groups', () => {
    expect(getFlattenedLinkRoutes(routes).map((r) => r.path)).toEqual(['/', '/shop'])
  })

  it('collects unique document types through groups', () => {
    expect(getReferenceTypesFromRoutes(routes)).toEqual(['product', 'page'])
  })

  it('keeps only folders whose type the schema accepts', () => {
    const filtered = applyReferenceTypes(routes, ['page'])
    expect(getReferenceTypesFromRoutes(filtered)).toEqual(['page'])
    expect(getFlattenedLinkRoutes(filtered).map((r) => r.path)).toEqual(['/', '/shop'])
  })
})

describe('getReferenceTypesFromSchemaType', () => {
  it('reads the compiled reference field targets', () => {
    const schemaType = {
      fields: [{name: 'reference', type: {to: [{name: 'page'}, {name: 'product'}]}}],
    }
    expect(getReferenceTypesFromSchemaType(schemaType)).toEqual(['page', 'product'])
  })

  it('returns an empty list when there is no reference field', () => {
    expect(getReferenceTypesFromSchemaType({fields: [{name: 'url'}]})).toEqual([])
    expect(getReferenceTypesFromSchemaType(undefined)).toEqual([])
  })
})

describe('defineLinkMenu', () => {
  it('warns about paths that do not start with a slash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineLinkMenu([group('Shop', [route('Bad', 'shop')])])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Shop > Bad path should start with "/"'),
    )
    warn.mockRestore()
  })
})
