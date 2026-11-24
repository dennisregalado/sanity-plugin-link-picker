# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [2.5.0] - 2026-11-24

### Added

- `resolveLinkHref(link, {resolveReference})` in a new `sanity-plugin-link-picker/resolve` entry
  point, which imports nothing: turns a queried link into an `href`, with the anchor's
  `#fragment` (replacing one in the URL), and refuses unsupported schemes like `javascript:`. A
  document link whose reference can't be resolved returns `null` rather than a bare fragment.
  `getAnchorFragment(anchor)` returns just the fragment.
- Sections can pin their anchor slug with a `slug` field, used by `syncSectionAnchors` and
  `getSectionAnchors` instead of one generated from the heading, so `#team` survives a heading
  change. Own slugs are reserved before generated ones; read another field with `getSlug`.
- Validation warnings (they don't block publishing) for links that can't work: a deleted or
  unpublished linked document, a section removed from its page, a section that isn't on the page
  the link goes to, and a section picked for a link to a URL.
- Inside a link to a URL, or to a document type without sections, the anchor picker no longer
  lists other pages' sections: it says why and offers the typed text as a custom fragment.
- A linked page without sections yet says that sections can be picked once the page is published.
- Browser smoke tests (`npm run test:e2e`, Playwright) run the dev Studio against a mocked
  Content Lake in CI.

### Changed

- Validation messages are translatable through the plugin's locale bundle (`validation.*` keys),
  falling back to English outside the Studio.

### Fixed

- A link to a deleted document shows "Document not found" instead of loading forever, and a
  missing section's "Section not found" is no longer clipped.

## [2.4.0] - 2026-11-23

### Added

- Valid email and phone links show as a card outside editing, like preset routes:
  `[envelope] hello@example.com Email`, `[phone] +15555550123 Phone`. Clicking it edits the link;
  a preset route with the same URL still wins.

### Changed

- Link icons render at Studio's native size and alignment: `@sanity/icons` (and any component
  icon) are passed straight to previews instead of through a fixed-size wrapper. Emoji and element
  icons are wrapped to match.
- The URL text input no longer shows a link-type icon while typing; icons stay on cards and picker
  options.
- `defineLinkMenu()` no longer warns about route paths that are full URLs or `mailto:`/`tel:`
  links, only about other paths that don't start with `/`.

## [2.3.0] - 2026-11-23

### Added

- A link URL that exactly matches a preset route (`route('Home', '/')`) shows as that route
  outside editing: a card with the route's icon, title and path, like a selected reference.
  Clicking it brings back the text input, focused, with the picker open; the pencil clears the URL
  and opens the picker. Other URLs keep the text input.

### Fixed

- A selected section with a long page or section title no longer wraps out of the field. It stays
  on one line, `[page icon] Page › Section #slug`; when space runs out, the page shrinks first
  (down to "…"), then the slug, and the section last.

## [2.2.1] - 2026-11-23

### Changed

- `anchor` fields render without their own fieldset: the input sits flush with sibling fields and
  carries the anchor field's title and description.
- Sections in the anchor picker look like they do in their page's sections list: each section's
  own preview title and media (or its type's icon), with `#slug` as the subtitle, in the two-line
  layout. Section types declared inline in the sections array are resolved through the page's
  schema.
- A selected section shows its section's icon and title in the compact row (`Section #slug`, or
  `Page › Section #slug` outside a link to that page).

## [2.2.0] - 2026-11-23

Section anchors, opt-in. A drop-in upgrade: without `anchors`, the schema and stored values are
unchanged. See [MIGRATION.md](./MIGRATION.md#upgrading-from-21-to-22).

### Added

- Section anchors, enabled with `linkPicker(routes, {anchors: {documentTypes}})`:
  - an `anchor` field type, `{url, reference}`, with a picker that browses documents with sections
    and their sections, searches all sections, and accepts a custom `#fragment`;
  - an `anchor` field on `link`;
  - a read-only `sectionAnchor` document type;
  - `sanity-plugin-link-picker/anchors`, with `syncSectionAnchors` for a Sanity Function that keeps
    `sectionAnchor` documents in sync with each document's `sections`, and `getSectionAnchors` for
    rendering matching section ids on the frontend.
- A selected section shows as a breadcrumb (`Page › Section #slug`), or as `Section #slug` inside
  a link to the same page.
- Inside a link that points at a document, the anchor picker lists only that document's sections;
  changing the link's target clears a section anchor (custom fragments are kept).
- Clicking a selected section opens its page at that section (`anchors.field`, default `sections`).

## [2.1.0] - 2026-11-17

Requires Sanity Studio `^6.10.0` and React `^19.2`. Coming from 2.0.0, see
[MIGRATION.md](./MIGRATION.md#upgrading-from-20-to-21): no config or schema changes are needed, but
check for links saved with draft ids.

### Changed

- Peer dependencies: `sanity` `^6.10.0` (was `^6`) and `react` `^19.2` (was `^18 || ^19`). Sanity
  6.10.0 is the first release on `@sanity/ui` 4, so 2.0.0 never worked correctly on 6.0–6.9, and
  Sanity 6 requires React 19.2.
- `@sanity/ui` and `@sanity/icons` are dependencies (were peer dependencies) with ranges matching what
  Sanity ships, as Sanity's plugin tooling requires, so npm shares the Studio's copy.
- Document search uses public GROQ (`text::query`) in the Studio's current perspective instead of
  Studio-internal search APIs. Results are ranked slightly differently from Studio's global search.
- Document folders the link schema can't reference (field-level routes for types not passed to
  `linkPicker()`) are hidden, with a development warning, instead of writing an invalid reference.
- Protocol-relative URLs (`//example.com`) are stored as `https://example.com` and treated as
  external; values containing backslashes are rejected.
- The plugin is named `sanity-plugin-link-picker` (was `link-picker`).
- Link type icons in the URL input and picker come from `@sanity/icons` (Link, EarthGlobe,
  Envelope, MobileDevice); the `lucide-react` dependency is removed.
- The URL clear button always shows a close icon (it showed a pencil for valid links).
- "No results" is plain text instead of a clickable row.
- Fields added with `options.fields` are spaced like other Studio fields.
- The default `link` preview shows the URL as subtitle, or as title when there's no label.

### Added

- `linkPicker()` accepts the result of `defineLinkMenu()`.
- `options.routes` on `type: 'link'` fields is typed (autocomplete and typo checking) through
  `IntrinsicDefinitions`; new `LinkDefinition` type.
- `en-US` locale bundle for all UI strings (`linkPickerLocaleNamespace`,
  `linkPickerUsEnglishLocaleBundle`, `LinkPickerLocaleResourceKeys`).
- Keyboard navigation in the picker: <kbd>↓</kbd>/<kbd>↑</kbd> move a highlight, <kbd>Enter</kbd>
  selects or opens a folder (ARIA combobox/listbox pattern).
- <kbd>Esc</kbd> and leaving the input close the picker; `aria-expanded`/`aria-controls` on the
  input; result counts announced to screen readers; accessible name on the "Replace reference"
  button.
- `LinkIconInput` is exported.

### Fixed

- Selecting a document that has a draft or release version stored that version's id
  (`drafts.…`/`versions.…`) as `_ref`; it now stores the published id.
- Fields added with `options.fields` were never rendered in the form.
- Selecting an item replaced the whole link object, wiping custom fields, adding a stray `_key` to
  non-array links and clearing the label for typed URLs. Selections now patch only `label`, `url`
  and `reference`.
- Read-only link fields could still be changed through the picker, clear and replace buttons.
- The URL input didn't report focus to Studio, so presence and focus tracking didn't work.
- Clearing the URL stored `null` instead of removing the field.
- Reference previews crashed outside the Structure and Presentation tools ("Pane is missing router
  context"), and missed documents that only exist in a content release.

## [2.0.0] - 2026-11-16

Requires Sanity Studio 6. See [MIGRATION.md](./MIGRATION.md#upgrading-from-1x-to-2x).

### Changed

- Studio UI moved to `@sanity/ui` 4 and `@sanity/icons` 5 (as peer dependencies).
- Peer dependency `sanity` is `^6` (was `^5 || ^6`).

## [1.1.1]

- Refined document search.

## [1.1.0]

- Renamed to `sanity-plugin-link-picker`; `linkPicker(routes, options)` API with `route`, `group` and
  `documents` helpers. See [MIGRATION.md](./MIGRATION.md#migrating-from-sanity-plugin-link-to-11).

[2.5.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/releases/tag/v2.0.0
