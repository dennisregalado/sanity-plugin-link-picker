# sanity-plugin-link-picker

<img width="800" height="521" alt="CleanShot 2026-06-29 at 12 10 51" src="https://github.com/user-attachments/assets/315ca49c-af57-4040-b838-b9272a2eade6" />

A small Sanity Studio link field for choosing a label, a URL, and optionally a weak reference, inspired by Shopify's link picker.

It registers a single `link` object type with two built-in fields:

- `label` - editor-facing link text, like `Shop now`
- `url` - a path, query string, hash, URL, email address, or phone number

When document routes are configured, it also adds:

- `reference` - a weak Sanity reference for internal links

The plugin stays intentionally unopinionated. It stores the link data, then lets your GROQ projection and frontend decide how references turn into URLs.

On the Studio side, the input normalizes what editors type (`example.com` becomes `https://example.com`, an email address becomes `mailto:…`) and validation flags anything that isn't a valid path, query string, hash, `http(s)` URL, `mailto:` or `tel:` link. Like any Sanity validation error, an invalid value blocks publishing but can still exist in drafts or be written through the API, so treat `url` as untrusted on the frontend (see [Rendering links safely](#rendering-links-safely)).

## Why this design

Most link solutions fall into one of two camps. This plugin avoids both.

**vs. one object type per target** (`pageLink`, `productLink`, `collectionLink`, …)

- One `link` type instead of N: a new linkable document is a new route, not a new schema object + GROQ fragment + frontend `_type` branch.
- The stored shape is always `{label, url, reference}`, so changing how a reference resolves is a query edit, not a schema migration.

**vs. an internal/external mode toggle** (a `linkType` field with conditionally hidden `reference`/`url` inputs, as in [`@sanity/presets`](https://github.com/sanity-io/plugins/tree/main/plugins/%40sanity/presets) `defineLink` and [`sanity-plugin-link-field`](https://github.com/winteragency/sanity-plugin-link-field))

- No mode to pick first: one search box resolves references, paths, URLs, `mailto:`, `tel:`, hashes, and query strings.
- No discriminator to branch on in GROQ, and no stale value left behind in the hidden half of the form.
- `url` accepts relative paths and bare `?query`/`#hash`, not just `http`/`https`/`mailto`/`tel`.

Either way you get validation at edit time and a uniform `{label, url}` on the frontend instead of switching on `_type`. Already on one of these schemas? See [Migrating From Custom Link Types](#migrating-from-custom-link-types).

## Installation

```sh
npm install sanity-plugin-link-picker
```

### Compatibility

| Plugin | Sanity Studio | React   | `@sanity/ui` / `@sanity/icons`                      |
| ------ | ------------- | ------- | --------------------------------------------------- |
| 2.x    | `^6.10.0`     | `^19.2` | 4 / 5, shared with your Studio's copy               |
| 1.x    | `^5 \|\| ^6`  | `^19`   | 3 / 3, its own copy (a second copy on Sanity 6.10+) |

- Sanity 6.10 is the first release on `@sanity/ui` 4, which the plugin's UI uses. On an older 6.x, upgrade Sanity or stay on 1.x.
- `@sanity/ui` and `@sanity/icons` are regular dependencies with ranges that match what Sanity ships, as Sanity's plugin tooling recommends, so npm installs a single shared copy. You don't need to add them yourself.
- On Sanity 5? Stay on the 1.x line: `npm install sanity-plugin-link-picker@^1`. Upgrading from 1.x? See [MIGRATION.md](./MIGRATION.md#upgrading-from-1x-to-2x).

## Usage

Add the plugin to `sanity.config.ts`:

```ts
import {defineConfig} from 'sanity'
import {linkPicker} from 'sanity-plugin-link-picker'

export default defineConfig({
  // ...
  plugins: [linkPicker()],
})
```

Use the `link` type anywhere in your schema:

```ts
import {defineField, defineType} from 'sanity'

export const hero = defineType({
  name: 'hero',
  title: 'Hero',
  type: 'object',
  fields: [
    defineField({
      name: 'link',
      title: 'Link',
      type: 'link',
    }),
  ],
})
```

## Stored Value

A saved link value looks like this:

```ts
type LinkValue = {
  _type?: 'link'
  label?: string | null
  url?: string | null
  reference?: {
    _type: 'reference'
    _ref: string
    _weak?: boolean
  } | null
}
```

For external links, paths, emails, phone numbers, hashes, and query strings, the value is stored in `url`.

For internal document links, configure document routes first. Those links are stored in `reference`.

## Querying Links

Project the fields your frontend needs. The plugin does not assume what an internal URL should look like.

```groq
*[_type == "page" && slug.current == $slug][0] {
  title,
  link {
    label,
    url,
    reference->{
      _type,
      slug
    }
  }
}
```

Then resolve the href in your app. `resolveLinkHref` from `sanity-plugin-link-picker/resolve` does this, anchors and unsafe URLs included (see [Resolving links on the frontend](#resolving-links-on-the-frontend)), or write your own:

```ts
type ProjectedLink = {
  label?: string | null
  url?: string | null
  reference?: {
    _type?: string
    slug?: {current?: string}
  } | null
}

function resolveLink(link?: ProjectedLink) {
  if (!link) return null
  if (link.url) return link.url

  if (link.reference?._type === 'page' && link.reference.slug?.current) {
    return `/${link.reference.slug.current}`
  }

  return null
}
```

Or resolve the final URL directly in GROQ if your route rules are simple:

```groq
*[_type == "page" && slug.current == $slug][0] {
  title,
  link {
    label,
    "url": coalesce(
      select(
        reference->_type == "product" => "/products/" + reference->store.slug.current,
        reference->_type == "collection" => "/collections/" + reference->slug.current
      ),
      url
    )
  }
}
```

That keeps the frontend shape as `{label, url}`. Reference URLs are inferred first, and the stored `url` field is used as the fallback.

## Link Picker Routes

The field works without configuration for labels and URL values. Add routes when you want the picker to offer shortcuts or browseable document folders.

```ts
import {defineConfig} from 'sanity'
import {linkPicker, route, documents} from 'sanity-plugin-link-picker'

export default defineConfig({
  // ...
  plugins: [
    linkPicker([
      route('Home', '/'),
      route('Shop', '/shop'),
      documents('Pages', 'page'),
      documents('Products', 'product'),
    ]),
  ],
})
```

You can also override routes on a single field. `options.routes` is typed, so your editor autocompletes it and flags typos. Field-level overrides can narrow or customize the picker, but document routes still need to be declared at the plugin level so Sanity can define accepted reference types. Document folders whose type isn't declared there are hidden, with a warning in development.

```ts
defineField({
  name: 'link',
  title: 'Link',
  type: 'link',
  options: {
    routes: [route('Contact', '/contact'), documents('Products', 'product')],
  },
})
```

Document routes control which reference types the picker can select. Static routes write to `url`; document selections write to `reference`. Selecting an item patches only `label`, `url` and `reference`: custom fields are left alone, and a label you've typed is only replaced when the selected route or document has a title.

Searching uses the Studio's current perspective, so drafts, published documents and content releases are all found, and references always store the published document id.

### Route helpers

| Helper                                     | Arguments                                                | Description                                                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route(title, path, options?)`             | `options.icon`                                           | A static path. Selecting it stores `path` in `url` and `title` in `label`.                                                                                                       |
| `group(title, routes, options?)`           | `options.icon`                                           | A labelled section of routes. Groups can nest.                                                                                                                                   |
| `documents(title, documentType, options?)` | `options.icon`, `options.filter`, `options.filterParams` | A browsable, searchable folder of documents, newest first. `filter` is a GROQ expression, for example `'defined(slug.current)'`. Selecting a document stores a weak `reference`. |
| `defineLinkMenu(routes)`                   |                                                          | Returns `{routes}` and warns in development about paths that don't start with `/`. Can be passed to `linkPicker()` or `options.routes`.                                          |

Icons can be any component (for example from `@sanity/icons`), a React element, or a string such as an emoji.

## Extending the Field

If your project needs extra fields, append them at the plugin level. You can also configure the Sanity preview for the `link` object with `preview`:

```ts
import {defineField} from 'sanity'

linkPicker([route('Home', '/'), documents('Pages', 'page')], {
  fields: [
    defineField({
      name: 'parameters',
      title: 'Parameters',
      type: 'string',
    }),
  ],
  preview: {
    select: {
      title: 'label',
      subtitle: 'url',
    },
  },
})
```

For links to page sections, use the built-in [section anchors](#section-anchors) instead of a custom `anchor` string field (the two can't share the name).

Keep the default fields stable when possible. Most projects can model extra frontend behavior in GROQ or in their link resolver without changing the stored shape.

### Plugin options

`linkPicker(routes?, options?)`

| Argument / option | Type                                        | Default                         | Description                                                                                                                   |
| ----------------- | ------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `routes`          | `LinkRouteDefinition[] \| LinksPluginProps` | `[]`                            | Routes, groups and document folders shown in the picker. Document folder types become the `reference` field's accepted types. |
| `options.fields`  | `FieldDefinition[]`                         | `[]`                            | Extra fields appended after `label`, `url` and `reference`.                                                                   |
| `options.icon`    | component or element                        | none                            | Icon for the `link` type, shown in array item previews.                                                                       |
| `options.preview` | `PreviewConfig`                             | label as title, URL as subtitle | Preview configuration for the `link` type.                                                                                    |
| `options.anchors` | `{documentTypes: string[], field?: string}` | none                            | Enables [section anchors](#section-anchors) for documents of these types. `field` is the sections array (default `sections`). |

Field options (`options` on a `type: 'link'` field):

| Option   | Type                                        | Description                                      |
| -------- | ------------------------------------------- | ------------------------------------------------ |
| `routes` | `LinkRouteDefinition[] \| LinksPluginProps` | Replaces the plugin-level routes for this field. |

## Section Anchors

Section anchors let editors link to a section of a page (`/about#team`) by picking it, instead of typing `#team` and hoping it still exists.

They're opt-in:

```ts
linkPicker([documents('Pages', 'page')], {
  anchors: {documentTypes: ['page']},
})
```

This registers:

- an `anchor` field type, `{url, reference}`, the same shape as a link: `url` holds a custom fragment like `#my-section`, `reference` a weak reference to a section;
- an `anchor` field on `link`, after `reference` and before your custom `fields`;
- a read-only `sectionAnchor` document type, one document per section, written by a Sanity Function (below).

```ts
defineField({name: 'jumpTo', title: 'Jump to', type: 'anchor'})
```

### The anchor picker

- **In a link that points at a document**, the picker goes straight to that document's sections. The anchor can only be on the linked page, so there's no page to choose. Typing searches those sections.
- **In a link to a URL**, or to a document type without sections, there's nothing to pick: the picker says so, and offers what you type as a custom fragment.
- **Anywhere else** (a standalone `anchor` field, or a link with no target), the picker lists every document that has sections, with the current document first. Click a document to see its sections in page order. Typing searches all sections.

The typed text is always offered as a custom fragment (`team` becomes `#team`). A selected section shows as a breadcrumb, `Page › Section #slug`. Inside a link to that page, where the page is already shown next to it, it's just `Section #slug`.

Clicking a selected section opens its page in a pane to the right, with that section open for editing. If your sections field isn't called `sections`, set `anchors: {documentTypes, field: 'blocks'}`, matching the `field` you pass to `syncSectionAnchors`.

When a link's reference changes to another page (or to a URL), its section anchor is cleared, since it belonged to the old page. A custom `#fragment` is kept.

Links that can't work are flagged with validation warnings, which don't block publishing:

- the linked document was deleted, or isn't published yet;
- the selected section was removed from its page;
- the selected section isn't on the page the link goes to (for example after an edit through the API), or the link goes to a URL, where only a custom fragment works.

A link with only an anchor goes to a section on the current page, so its section has to be on the document being edited.

### Creating anchors with a Sanity Function

A Function creates a `sectionAnchor` document for each section in a document's `sections` array, and keeps them in sync on publish:

- the slug is the section's own `slug` field when it has one, else generated from its heading (its `heading`, `title`, `name` or `label`), and made unique within the document (`features`, `features-2`);
- the document id comes from the parent document and the section's `_key`, so links keep pointing at the same section when its heading (and slug) changes;
- sections without a heading get no anchor; when a section or the whole document is deleted, its anchors are deleted, and links to them stop resolving (references are weak).

Anchors are written for published documents only, so a new section can be picked once its page is published. Until then, the page's sections list in the picker says so.

#### Stable slugs

A generated slug follows the heading: rename "Our team" to "Meet the team" and `#our-team` becomes `#meet-the-team`. Links picked in the Studio keep working (they reference the section, not the slug), but typed fragments and links from outside the site don't. To pin a section's slug, give the section type a `slug` field; the Function uses it instead of the heading:

```ts
defineField({
  name: 'slug',
  title: 'Anchor',
  type: 'slug',
  description: 'The #fragment that links to this section. Generated from the heading when empty.',
  options: {
    source: (_document, {parent}) =>
      !Array.isArray(parent) && typeof parent.heading === 'string' ? parent.heading : '',
    // Slugs only need to be unique within their page, which the Function takes care of;
    // the default check would reject `team` on a second page
    isUnique: () => true,
  },
})
```

Sections' own slugs are reserved before generated ones, so a section that picked `team` keeps it even if an earlier section is headed "Team". A section with a slug gets an anchor even without a heading. To read the slug from another field, pass `getSlug` (to `getSectionAnchors` too, so your frontend renders the same ids).

```sh
npm install @sanity/functions @sanity/client sanity-plugin-link-picker
```

```ts
// sanity.blueprint.ts
import {defineBlueprint, defineDocumentFunction} from '@sanity/blueprints'

export default defineBlueprint({
  resources: [
    defineDocumentFunction({
      name: 'section-anchors',
      event: {
        on: ['create', 'update', 'delete'],
        filter: "_type in ['page'] && (defined(sections) || defined(before().sections))",
        projection: '{_id, _type, sections, "operation": delta::operation()}',
      },
    }),
  ],
})
```

```ts
// functions/section-anchors/index.ts
import {createClient} from '@sanity/client'
import {documentEventHandler} from '@sanity/functions'
import {syncSectionAnchors} from 'sanity-plugin-link-picker/anchors'

export const handler = documentEventHandler(async ({context, event}) => {
  const client = createClient({...context.clientOptions, apiVersion: '2025-05-08', useCdn: false})
  const result = await syncSectionAnchors(client, event.data, {dryRun: context.local})
  console.log('section anchors', result)
})
```

The `operation` in the projection is what lets the Function delete anchors when a document is deleted. Options for `syncSectionAnchors`:

| Option     | Type                               | Default               | Description                                |
| ---------- | ---------------------------------- | --------------------- | ------------------------------------------ |
| `field`    | `string`                           | `'sections'`          | The array field holding the sections.      |
| `getTitle` | `(section) => string \| undefined` | `heading`, `title`, … | Reads a section's heading.                 |
| `getSlug`  | `(section) => string \| undefined` | `slug`                | Reads a section's own slug.                |
| `dryRun`   | `boolean`                          | `false`               | Computes the changes without writing them. |

`sanity-plugin-link-picker/anchors` has no dependency on `sanity` or React, so it is safe to use in Functions and frontends. To backfill anchors for existing pages, run `syncSectionAnchors` over them once from a script with a write token.

`sectionAnchor` documents show up in the Structure tool's default list. To hide them:

```ts
structureTool({
  structure: (S) =>
    S.list()
      .title('Content')
      .items(S.documentTypeListItems().filter((item) => item.getId() !== 'sectionAnchor')),
})
```

### Querying and rendering anchors

```groq
link {
  label,
  url,
  reference->{_type, slug},
  anchor {
    url,
    "slug": reference->slug.current
  }
}
```

```ts
import {resolveLinkHref} from 'sanity-plugin-link-picker/resolve'

resolveLinkHref(link, {resolveReference: (ref) => (ref.slug ? `/${ref.slug.current}` : null)})
// '/about#team'
```

Render each section with the matching `id`, using the same helper as the Function:

```tsx
import {getSectionAnchors} from 'sanity-plugin-link-picker/anchors'

const ids = new Map(getSectionAnchors(page.sections).map((anchor) => [anchor.key, anchor.slug]))

page.sections.map((section) => (
  <Section key={section._key} id={ids.get(section._key)} {...section} />
))
```

Pass the same `getTitle` and `getSlug` to `getSectionAnchors` as to `syncSectionAnchors` if you customized them.

## Resolving links on the frontend

`sanity-plugin-link-picker/resolve` turns a queried link into an `href`. It imports nothing (no `sanity`, React or other helpers), so it adds only itself to a frontend bundle.

```groq
link {
  label,
  url,
  reference->{_type, "slug": slug.current},
  anchor {url, "slug": reference->slug.current}
}
```

```ts
import {resolveLinkHref} from 'sanity-plugin-link-picker/resolve'

const href = resolveLinkHref(link, {
  resolveReference: (ref) => {
    if (ref._type === 'page') return ref.slug ? `/${ref.slug}` : '/'
    if (ref._type === 'product') return `/products/${ref.slug}`
    return null
  },
})
```

- A URL link returns its URL; a document link returns what `resolveReference` returns for the projected `reference`, which is typed by your query.
- The anchor's custom `url` or its section's slug is added as the `#fragment`, replacing one already in the URL. `mailto:` and `tel:` links ignore anchors. A link with only an anchor returns the fragment (`#team`).
- It returns `null` when there's nothing to link to, when `resolveReference` returns `null` (an unpublished document, or a type without a route: rather than linking to the anchor on the current page), and for unsupported schemes such as `javascript:` (see [Rendering links safely](#rendering-links-safely)).

The anchor can be projected as a string, `coalesce(anchor.url, "#" + anchor.reference->slug.current)`, or as `anchor {url, reference->{slug}}`; `getAnchorFragment(anchor)` returns just the fragment.

## Rendering links safely

`url` holds what editors entered, normalized. Validation rejects `javascript:` and other unsupported schemes, and protocol-relative URLs (`//example.com`) are stored as `https://`. But values written through the API, or drafts with validation errors, skip the Studio, so check the scheme before rendering:

`resolveLinkHref` does this check for you. Otherwise:

```ts
const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|#|\?)/i

function safeHref(url?: string | null) {
  return url && SAFE_URL.test(url.trim()) ? url.trim() : undefined
}
```

## Localization

All Studio UI strings are registered as an `en-US` locale bundle in the `sanity-plugin-link-picker` namespace. To translate them, register a bundle for another locale with the same namespace and keys:

```ts
import {defineLocaleResourceBundle} from 'sanity'
import {linkPickerLocaleNamespace} from 'sanity-plugin-link-picker'

const norwegian = defineLocaleResourceBundle({
  locale: 'nb-NO',
  namespace: linkPickerLocaleNamespace,
  resources: {
    'search.searching': 'Søker...',
    'search.result-count_one': '{{count}} treff',
    'search.result-count_other': '{{count}} treff',
    'search.result-count-more': '{{count}}+ treff',
    'search.no-results': 'Ingen treff',
    'folder.back': 'Tilbake',
    'reference.replace': 'Bytt referanse',
  },
})

// defineConfig({i18n: {bundles: [norwegian]}, ...})
```

The `LinkPickerLocaleResourceKeys` type lists every key. Validation messages (`validation.*`) are translated the same way. Outside the Studio, for example in `sanity documents validate`, they're in English.

## Accessibility

- The picker opens when the URL input is focused, or with <kbd>↓</kbd>/<kbd>↑</kbd>.
- <kbd>↓</kbd>/<kbd>↑</kbd> move through routes, folders, **Back** and documents; <kbd>Enter</kbd> selects the highlighted item or opens the highlighted folder. Moving the mouse hands back to normal hover.
- <kbd>Esc</kbd> closes the picker without closing the surrounding pane or dialog, and leaving the input closes it too.
- The picker follows the ARIA combobox pattern (`role="combobox"` with `aria-activedescendant`, a listbox of options), and result counts are announced to screen readers.
- Read-only fields never open the picker.

## Migrating From Custom Link Types

A common pattern this plugin replaces is the "polymorphic CTA array": a field whose items can be one of several hand-rolled link object types, for example `link`, `pageLink`, `productLink`, and `collectionLink`. Each variant typically carries its own `title`, its own reference, and its own frontend URL rules.

With this plugin you can collapse all of those into a single `link` type. A CTA list becomes a plain array of `link`, and the URL rules move out of the schema and into your GROQ projection or link resolver.

```ts
// Before: an array of four bespoke object types
defineField({
  name: 'ctaList',
  type: 'array',
  of: [
    {type: 'link'}, // local generic url object
    {type: 'pageLink'},
    {type: 'productLink'},
    {type: 'collectionLink'},
  ],
})

// After: a plain array of the plugin's link type
defineField({
  name: 'ctaList',
  type: 'array',
  of: [{type: 'link'}],
  // a single CTA is just the same array with a max
  // validation: (rule) => rule.max(1),
})
```

### Field mapping

| Old shape                                         | Plugin field | Notes                                                                           |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `title`                                           | `label`      | Editor-facing text.                                                             |
| `link.url`                                        | `url`        | External URLs, paths, `mailto:`, `tel:`, hashes, query strings.                 |
| `pageLink` / `productLink` / `collectionLink` ref | `reference`  | Keep the same `_ref`; the URL is resolved in GROQ from the referenced document. |

The plugin intentionally stores only `{label, url, reference}`. Anything URL-shaped lives in `url`; anything internal lives in `reference`. Your frontend decides what a reference becomes.

### Migrating the content

Changing the schema does **not** rewrite existing documents. Existing array items still have their old `_type` (`pageLink`, `productLink`, etc.) and old field names, so they won't validate against the new `link`-only array until you migrate them.

The key insight: the `_type` of an object **inside an array** is mutable (only a _document's_ `_id` and `_type` are immutable). That means a single content migration can rewrite each old variant into a plugin `link` in place.

Scaffold a migration with `sanity migration create`, then adapt this:

```ts
// migrations/collapse-cta-links/index.ts
import {defineMigration, set} from 'sanity/migrate'

const OLD_LINK_TYPES = ['link', 'pageLink', 'productLink', 'collectionLink']

export default defineMigration({
  title: 'Collapse custom CTA link types into the plugin link type',
  // Limit to the documents that actually use ctaList / cta.
  // documentTypes: ['page', 'productLanding', 'collection'],
  migrate: {
    object(node, path, context) {
      if (!OLD_LINK_TYPES.includes(node._type as string)) return

      // Skip items that already look like the new plugin shape.
      if (node._type === 'link' && 'label' in node) return

      const next: Record<string, unknown> = {
        _type: 'link',
        _key: node._key, // preserve the array key
      }

      // title -> label
      if (node.title) next.label = node.title

      // plain url variant
      if (node.url) next.url = node.url

      // internal variants -> reference.
      // Adjust the source field name(s) to match your old schema
      // (e.g. `reference`, `page`, `product`, `collection`).
      const ref =
        (node.reference as any) ??
        (node.page as any) ??
        (node.product as any) ??
        (node.collection as any)

      if (ref?._ref) {
        next.reference = {_type: 'reference', _ref: ref._ref, _weak: true}
      }

      return set(next)
    },
  },
})
```

This migration is idempotent: the `'label' in node` guard means re-running it leaves already-migrated links untouched.

Always back up first and dry-run before committing:

```sh
# back up the dataset
npx sanity dataset export

# dry run (default) – review the patches
npx sanity migration run collapse-cta-links

# apply for real
npx sanity migration run collapse-cta-links --no-dry-run
```

### Resolving the URL on the frontend

Because the URL rules left the schema, resolve them in GROQ. References become paths by `_type`, and the stored `url` is used as the fallback:

```groq
ctaList[] {
  _type,
  label,
  "url": coalesce(
    select(
      reference->_type == "productLanding" => "/products/" + reference->slug.current,
      reference->_type == "collection"     => "/collections/" + reference->slug.current,
      defined(reference)                   => "/" + reference->slug.current
    ),
    url
  )
}
```

That gives every CTA the same `{label, url}` shape on the frontend, so your `<Link>` component no longer needs to branch on `pageLink` / `productLink` / `collectionLink`.

For the full workflow (validating documents, staging datasets, defensive code, rate limits), see Sanity's [schema and content migrations guide](https://www.sanity.io/docs/content-lake/schema-and-content-migrations) and the [content migration cheat sheet](https://www.sanity.io/docs/content-lake/content-migration-cheatsheet).

## API

```ts
import {
  // Plugin and route helpers
  linkPicker,
  route,
  group,
  documents,
  defineLinkMenu,
  // Localization
  linkPickerLocaleNamespace,
  linkPickerUsEnglishLocaleBundle,
  type LinkPickerLocaleResourceKeys,
  // Types
  type LinkValue,
  type LinkReferenceValue,
  type LinkDefinition,
  type LinkFieldOptions,
  type LinkFieldPluginOptions,
  type LinkRouteDefinition,
  type StaticLinkRoute,
  type LinkRouteGroup,
  type LinkDocumentFolder,
  type LinkIconInput,
  type LinksPluginProps,
  type LinkSchemaType,
  type LinkInputProps,
  // Section anchors
  SECTION_ANCHOR_TYPE,
  type AnchorValue,
  type AnchorDefinition,
  type AnchorInputProps,
  type AnchorPluginOptions,
} from 'sanity-plugin-link-picker'
// Section anchors, for Sanity Functions and frontends (no `sanity` or React dependency)
import {
  syncSectionAnchors,
  getSectionAnchors,
  buildSectionAnchorDocuments,
  getAnchorDocumentId,
  getDefaultSectionTitle,
  getDefaultSectionSlug,
  slugify,
  SECTION_ANCHOR_TYPE,
  DEFAULT_SECTIONS_FIELD,
} from 'sanity-plugin-link-picker/anchors'
// Resolving links on the frontend (no imports at all)
import {resolveLinkHref, getAnchorFragment} from 'sanity-plugin-link-picker/resolve'
```

## Development

Requires Node.js 24 or later (for `@sanity/plugin-kit` 10; the published package supports Node 20.19+).

```sh
npm install
npm run dev        # test studio in dev/, loads the plugin from src/
npm run lint       # oxlint (type-aware)
npm run format     # oxfmt
npm run typecheck
npm test           # vitest
npm run test:e2e   # Playwright: the test studio against a mocked Content Lake
npm run build      # plugin-kit verify-package + pkg-utils build --strict
```

The browser tests (`e2e/`) start the test studio and answer its API requests from an in-memory dataset (`e2e/mock-api.ts`), so they need no project. Install the browser once with `npx playwright install chromium`.

The test studio needs a Sanity project: copy `dev/.env.example` to `dev/.env.development` and fill it in. Opening the demo document doesn't write anything; filled-in examples come from `initialValue`.

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

Upgrading from 2.0, from 1.x (Sanity 6 required), or from `sanity-plugin-link` / the earlier `linkPlugin` / `linkRoute` API? See [MIGRATION.md](./MIGRATION.md).

## Releasing

npm releases are published by GitHub Actions ([`publish.yml`](.github/workflows/publish.yml)) using npm trusted publishing. Nobody runs `npm publish` locally.

1. In your PR, bump `"version"` in `package.json` (and `package-lock.json`, e.g. `npm version 2.1.0 --no-git-tag-version`) and add a [CHANGELOG.md](./CHANGELOG.md) entry.
2. Merge the PR. CI ([`ci.yml`](.github/workflows/ci.yml)) checks formatting and runs lint, typecheck, tests and the build on every PR and push to `main`.
3. Publish a GitHub release whose tag is `v<version>` (e.g. `v2.1.0`), targeting `main`. The workflow checks the tag matches `package.json`, reruns the typecheck and build via `prepublishOnly`, and publishes with provenance.

## License

[MIT](LICENSE) © Dennis Regalado
