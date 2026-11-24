/**
 * Validation for link and anchor fields. Problems a link can still be saved with (a deleted or
 * unpublished target, a section on another page) are warnings; malformed URLs are errors.
 */

import type {CustomValidatorResult, ValidationContext, ValidationError} from 'sanity'

import {API_VERSION} from './constants'
import {isAnchorHref, normalizeLinkHref} from './href'
import {linkPickerLocaleNamespace} from './i18n'
import linkPickerResources from './i18n/resources'
import {getPublishedDocumentId} from './ids'

type ValidationMessageKey = Extract<keyof typeof linkPickerResources, `validation.${string}`>

type ReferenceLike = {_ref?: unknown} | null | undefined

/** A validation message in the Studio's language, falling back to English. */
export async function getValidationMessage(
  context: ValidationContext,
  key: ValidationMessageKey,
): Promise<string> {
  // Studio's locale source holds the plugin's bundles, including translations registered with
  // `defineLocaleResourceBundle`. Outside the Studio (e.g. `sanity documents validate`) it may be
  // missing or lack the plugin's strings, so English is the fallback.
  const {i18n} = context
  if (!i18n) return linkPickerResources[key]
  try {
    await i18n.loadNamespaces([linkPickerLocaleNamespace])
  } catch {
    // Use whatever is loaded
  }
  const text: unknown = i18n.t(key, {ns: linkPickerLocaleNamespace})
  // i18next returns the key itself for a missing string
  return typeof text === 'string' && text && text !== key ? text : linkPickerResources[key]
}

function getRefId(value: ReferenceLike): string | undefined {
  return value && typeof value._ref === 'string' && value._ref ? value._ref : undefined
}

/** `link.url`: a path, query string, URL, email address or phone number. */
export async function validateLinkUrl(
  value: string | undefined,
  context: ValidationContext,
): Promise<CustomValidatorResult> {
  if (!value || value.trim().startsWith('?') || normalizeLinkHref(value)) return true
  return getValidationMessage(context, 'validation.invalid-url')
}

/** `anchor.url`: a fragment like `#team`. */
export async function validateAnchorUrl(
  value: string | undefined,
  context: ValidationContext,
): Promise<CustomValidatorResult> {
  if (!value || isAnchorHref(value)) return true
  return getValidationMessage(context, 'validation.invalid-anchor')
}

/**
 * Whether a document is published, only exists as a draft or in a release, or doesn't exist.
 * Uses Studio's reference tracking when available, which re-validates when the target changes.
 */
async function getReferenceState(
  id: string,
  context: ValidationContext,
): Promise<'published' | 'unpublished' | 'missing'> {
  const client = context.getClient({apiVersion: API_VERSION})
  const published = context.getDocumentExists
    ? await context.getDocumentExists({id, signal: context.signal})
    : await client.fetch<boolean>(
        'defined(*[_id == $id][0]._id)',
        {id},
        {perspective: 'raw', signal: context.signal, tag: 'link-picker.validation'},
      )
  if (published) return 'published'

  const hasVersions = await client.fetch<boolean>(
    'count(*[sanity::versionOf($id)]) > 0',
    {id},
    {perspective: 'raw', signal: context.signal, tag: 'link-picker.validation'},
  )
  return hasVersions ? 'unpublished' : 'missing'
}

/** `link.reference`: warns when the linked document was deleted or isn't published. */
export async function validateLinkReference(
  value: ReferenceLike,
  context: ValidationContext,
): Promise<CustomValidatorResult> {
  const id = getRefId(value)
  if (!id) return true
  const state = await getReferenceState(id, context)
  if (state === 'published') return true
  return getValidationMessage(
    context,
    state === 'missing' ? 'validation.reference-missing' : 'validation.reference-unpublished',
  )
}

/** `anchor.reference`: warns when the section was removed from its page. */
export async function validateSectionReference(
  value: ReferenceLike,
  context: ValidationContext,
): Promise<CustomValidatorResult> {
  const id = getRefId(value)
  if (!id) return true
  // Section anchors are only ever published (the Function writes them with `liveEdit`)
  const state = await getReferenceState(id, context)
  return state === 'published' ? true : getValidationMessage(context, 'validation.section-missing')
}

/** {@link getAnchorTarget} of a link to a URL. Not a valid document id, so it can't collide. */
export const URL_TARGET = '#url'

type ParentLink = {url?: unknown; reference?: ReferenceLike}

function getParentLink(context: ValidationContext): ParentLink | undefined {
  const parent = context.parent
  return parent && typeof parent === 'object' ? parent : undefined
}

/**
 * The page a link's anchor has to be on: the linked document; the document being edited for a
 * link with only an anchor (or a `#hash` URL); `URL_TARGET` for a link to a URL, where a
 * section can't be used.
 */
export function getAnchorTarget(
  link: ParentLink | undefined,
  documentId: string | undefined,
): string | undefined {
  const linkedId = getRefId(link?.reference)
  if (linkedId) return linkedId
  const url = typeof link?.url === 'string' ? link.url.trim() : ''
  if (url && !url.startsWith('#')) return URL_TARGET
  return documentId ? getPublishedDocumentId(documentId) : undefined
}

/**
 * `link.anchor`: warns when the picked section isn't on the page the link goes to, e.g. after the
 * link was changed through the API, or for a link to a URL.
 */
export async function validateLinkAnchor(
  value: {reference?: ReferenceLike} | null | undefined,
  context: ValidationContext,
): Promise<CustomValidatorResult> {
  const anchorId = getRefId(value?.reference)
  if (!anchorId) return true

  const target = getAnchorTarget(getParentLink(context), context.document?._id)
  if (!target) return true

  // Put the warning on the section itself, which is what the editor sees
  const warn = async (key: ValidationMessageKey): Promise<ValidationError> => ({
    message: await getValidationMessage(context, key),
    path: ['reference'],
  })

  if (target === URL_TARGET) return warn('validation.anchor-needs-document')

  const parentId = await context
    .getClient({apiVersion: API_VERSION})
    .fetch<string | null>(
      '*[_id == $id][0].parent._ref',
      {id: anchorId},
      {perspective: 'raw', signal: context.signal, tag: 'link-picker.validation'},
    )
  // A missing section is reported on the section field itself
  return !parentId || parentId === target ? true : warn('validation.anchor-other-page')
}
