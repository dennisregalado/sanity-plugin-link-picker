# Migration guide

- [Upgrading from 2.1 to 2.2](#upgrading-from-21-to-22): drop-in; section anchors are opt-in
- [Upgrading from 2.0 to 2.1](#upgrading-from-20-to-21): Sanity 6.10 and React 19.2 required
- [Upgrading from 1.x to 2.x](#upgrading-from-1x-to-2x): Sanity 6 required
- [Migrating from `sanity-plugin-link` to 1.1](#migrating-from-sanity-plugin-link-to-11): package rename and API changes

## Upgrading from 2.1 to 2.2

2.2 is a drop-in upgrade. Without the new `anchors` option, the `link` schema type, stored values and queries are unchanged.

To use [section anchors](./README.md#section-anchors), pass `anchors: {documentTypes: [...]}` to `linkPicker()` and deploy the anchors Function. This adds an `anchor` field to `link`: if you added your own `anchor` field through `fields`, rename or remove it first, since the two can't share a name.

```sh
npm install sanity-plugin-link-picker@^2.2
```

## Upgrading from 2.0 to 2.1

2.1 is a drop-in upgrade: the plugin's API, the `link` schema type and stored values are unchanged, and you don't need to change your Studio config, schemas or queries. See [CHANGELOG.md](./CHANGELOG.md) for everything that changed.

- **Requirements:** Sanity `^6.10.0` and React `^19.2`. 2.0 claimed `sanity@^6`, but it uses `@sanity/ui` 4, which Sanity only ships from 6.10.0.
- **`@sanity/ui` and `@sanity/icons` are no longer peer dependencies.** They're regular dependencies with ranges matching Sanity, so npm still installs a single shared copy. Nothing to do unless you pinned old majors yourself (see step 3 below).
- **Check for links saved with draft ids.** 2.0 and earlier stored the draft's id (`drafts.…`) in `reference._ref` when an editor picked a document that had unpublished changes. Those references break once the draft is published. 2.1 always stores the published id. Find affected links (adjust the field path to your schema) and re-pick or patch them:

```groq
*[defined(link.reference._ref) && link.reference._ref match "drafts.*"]{_id, "ref": link.reference._ref}
```

```sh
npm install sanity@^6.10 sanity-plugin-link-picker@^2.1
```

## Upgrading from 1.x to 2.x

2.x moves the plugin's Studio UI to `@sanity/ui` 4 and `@sanity/icons` 5, the versions Sanity 6.10+ ships. The plugin's API, the `link` schema type and stored document values (`label`, `url`, `reference`) are unchanged. You don't need to change your Studio config, schemas, queries or content.

### What changed

- **Sanity 6.10 or later is required.** The `sanity` peer dependency is now `^6.10.0`; 1.x accepted `^5 || ^6`. The plugin uses `@sanity/ui` 4 and `@sanity/icons` 5 (including subpaths such as `@sanity/ui/popover` and `@sanity/icons/Edit`). Sanity 6.10.0 is the first release that ships `@sanity/ui` 4; Sanity 5 and 6.0–6.9 use `@sanity/ui` 3.
- **React 19.2 or later.** The `react` peer dependency is `^19.2`, matching what Sanity 6 requires.
- **`@sanity/ui` and `@sanity/icons` are dependencies with Studio-matching ranges** (`^4.0.3` / `^5.2.1`), as Sanity's plugin tooling recommends. npm deduplicates them with the copies `sanity` installs, so the plugin uses your Studio's own copy. You don't need to add them.
- **Fixes that affect stored data.** Selecting a document from a draft or release now stores the published id in `reference._ref` (earlier versions could store `drafts.…` or `versions.…` ids, which break once the draft is published). Selections patch `label`, `url` and `reference` individually instead of replacing the whole link, so custom fields survive. Clearing `url` or switching between `url` and `reference` now removes the other field instead of setting it to `null`.

To find links saved with a draft id by earlier versions, see [Upgrading from 2.0 to 2.1](#upgrading-from-20-to-21).

### 1. Upgrade your Studio to Sanity 6.10 or later

If you're on Sanity 5 or an earlier 6.x, upgrade first (see Sanity's own upgrade notes for anything else that changed in your Studio):

```sh
npm install sanity@^6.10
```

### 2. Upgrade the plugin

```sh
npm install sanity-plugin-link-picker@^2
```

### 3. Check for direct `@sanity/ui` / `@sanity/icons` pins

If your Studio's own `package.json` lists `@sanity/ui` or `@sanity/icons` at an older major (for example `@sanity/ui@^3`), upgrade them to `^4` / `^5`, or remove them if your code doesn't import them. An older pin can leave two copies installed. Confirm there's one copy of each:

```sh
npm ls @sanity/ui @sanity/icons
```

### Staying on Sanity 5

Keep using 1.x. It's API-compatible with 2.0:

```sh
npm install sanity-plugin-link-picker@^1
```

### Checklist

- [ ] Studio is on `sanity@^6.10` and React 19.2+
- [ ] Install `sanity-plugin-link-picker@^2`
- [ ] Remove or upgrade any direct `@sanity/ui@^3` / `@sanity/icons@^3` pins
- [ ] `npm ls @sanity/ui @sanity/icons` shows one copy of each
- [ ] Restart Studio and smoke-test the link picker

## Migrating from `sanity-plugin-link` to 1.1

This covers the package rename and the 1.1 API changes. Stored document values (`label`, `url`, `reference`) are unchanged — only Studio config and imports need updates.

### 1. Install the new package

```sh
npm uninstall sanity-plugin-link
npm install sanity-plugin-link-picker
```

### 2. Update imports

```diff
- import {linkPlugin, linkRoute} from 'sanity-plugin-link'
+ import {linkPicker, route, documents, group} from 'sanity-plugin-link-picker'
```

### 3. Rename the plugin

```diff
- plugins: [linkPlugin(/* ... */)],
+ plugins: [linkPicker(/* ... */)],
```

### 4. Pass routes as the first argument

**Before (options object):**

```ts
linkPlugin({
  routes: [
    linkRoute.route('Home', '/'),
    linkRoute.route('Shop', '/shop'),
    linkRoute.documents('Pages', 'page'),
    linkRoute.documents('Products', 'product'),
  ],
  fields: [defineField({name: 'parameters', type: 'string'})],
})
```

**After (routes first, options second):**

```ts
linkPicker(
  [
    route('Home', '/'),
    route('Shop', '/shop'),
    documents('Pages', 'page'),
    documents('Products', 'product'),
  ],
  {
    fields: [defineField({name: 'parameters', type: 'string'})],
  },
)
```

Routes only:

```ts
linkPicker([route('Home', '/'), documents('Pages', 'page')])
```

No config:

```ts
linkPicker()
```

### 5. Flatten route helpers

| Before                             | After                    |
| ---------------------------------- | ------------------------ |
| `linkRoute.route(title, path)`     | `route(title, path)`     |
| `linkRoute.documents(title, type)` | `documents(title, type)` |
| `linkRoute.group(title, routes)`   | `group(title, routes)`   |

Field-level overrides still use `options.routes`:

```ts
defineField({
  name: 'link',
  type: 'link',
  options: {
    routes: [route('Contact', '/contact'), documents('Products', 'product')],
  },
})
```

### Checklist

- [ ] Swap the npm package
- [ ] Replace `linkPlugin` with `linkPicker`
- [ ] Move `routes` out of the options object into the first argument
- [ ] Replace `linkRoute.*` with `route` / `documents` / `group`
- [ ] Restart Studio and smoke-test the link picker
