import {describe, expect, it} from 'vitest'

import {documents, linkPicker} from '..'
import {createAnchorType, createLinkType, createSectionAnchorType} from '../schema'

const fieldNames = (type: {fields?: {name: string}[]}) => type.fields?.map((field) => field.name)

describe('link schema', () => {
  it('has no anchor field unless anchors are enabled', () => {
    expect(fieldNames(createLinkType([documents('Pages', 'page')], {}))).toEqual([
      'label',
      'url',
      'reference',
    ])
  })

  it('adds the anchor field after reference and before custom fields', () => {
    const type = createLinkType([documents('Pages', 'page')], {
      anchors: {documentTypes: ['page']},
      fields: [{name: 'parameters', type: 'string'}],
    })
    expect(fieldNames(type)).toEqual(['label', 'url', 'reference', 'anchor', 'parameters'])
  })
})

describe('anchor schema', () => {
  it('stores a fragment or a weak reference to a section', () => {
    const type = createAnchorType({documentTypes: ['page']})
    expect(fieldNames(type)).toEqual(['url', 'reference'])
    const reference = type.fields.find((field) => field.name === 'reference')
    expect(reference).toMatchObject({weak: true, to: [{type: 'sectionAnchor'}]})
  })

  it('points section anchors at the configured document types', () => {
    const type = createSectionAnchorType({documentTypes: ['page', 'landingPage']})
    expect(type).toMatchObject({name: 'sectionAnchor', readOnly: true, liveEdit: true})
    const parent = type.fields.find((field) => field.name === 'parent')
    expect(parent).toMatchObject({weak: true, to: [{type: 'page'}, {type: 'landingPage'}]})
  })

  it('rejects anchors without document types', () => {
    expect(() => linkPicker([], {anchors: {documentTypes: []}})).toThrow(/documentTypes/)
  })
})
