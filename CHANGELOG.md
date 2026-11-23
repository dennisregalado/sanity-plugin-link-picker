# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [2.2.1] - 2026-11-23

### Changed

- `anchor` fields render without their own fieldset: the input sits flush with sibling fields and
  carries the anchor field's title and description.

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

[2.2.1]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/dennisregalado/sanity-plugin-link-picker/releases/tag/v2.0.0
