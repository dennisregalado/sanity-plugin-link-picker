# Migration guide

- [Upgrading from 1.x to 2.0](#upgrading-from-1x-to-20): Sanity 6 required
- [Migrating from `sanity-plugin-link` to 1.1](#migrating-from-sanity-plugin-link-to-11): package rename and API changes

## Upgrading from 1.x to 2.0

2.0 moves the plugin's Studio UI to `@sanity/ui` 4 and `@sanity/icons` 5, the versions Sanity 6 ships. The plugin's API, the `link` schema type and stored document values (`label`, `url`, `reference`) are unchanged. You don't need to change your Studio config, schemas, queries or content.

### What changed

- **Sanity 6 is required.** The `sanity` peer dependency is now `^6`; 1.x accepted `^5 || ^6`. The plugin imports from `@sanity/ui` 4 and `@sanity/icons` 5 subpaths (`@sanity/ui/popover`, `@sanity/ui/tooltip`, `@sanity/icons/Edit`, …), which don't exist in the `@sanity/ui` 3 / `@sanity/icons` 3 that Sanity 5 uses.
- **`@sanity/ui` and `@sanity/icons` are peer dependencies.** The plugin no longer installs its own copies; it uses your Studio's: `@sanity/ui@^4` and `@sanity/icons@^5`. `sanity` already depends on both, so you don't need to add them.

### 1. Upgrade your Studio to Sanity 6

If you're still on Sanity 5, upgrade first (see Sanity's own upgrade notes for anything else that changed in your Studio):

```sh
npm install sanity@^6
```

### 2. Upgrade the plugin

```sh
npm install sanity-plugin-link-picker@^2
```

### 3. Check for direct `@sanity/ui` / `@sanity/icons` pins

If your Studio's own `package.json` lists `@sanity/ui` or `@sanity/icons` at an older major (for example `@sanity/ui@^3`), upgrade them to `^4` / `^5`, or remove them if your code doesn't import them. An older pin conflicts with the plugin's peer range and can leave two copies installed. Confirm there's one copy of each:

```sh
npm ls @sanity/ui @sanity/icons
```

### Staying on Sanity 5

Keep using 1.x. It's API-compatible with 2.0:

```sh
npm install sanity-plugin-link-picker@^1
```

### Checklist

- [ ] Studio is on `sanity@^6`
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
  fields: [
    defineField({name: 'parameters', type: 'string'}),
  ],
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
    fields: [
      defineField({name: 'parameters', type: 'string'}),
    ],
  },
)
```

Routes only:

```ts
linkPicker([
  route('Home', '/'),
  documents('Pages', 'page'),
])
```

No config:

```ts
linkPicker()
```

### 5. Flatten route helpers

| Before | After |
| --- | --- |
| `linkRoute.route(title, path)` | `route(title, path)` |
| `linkRoute.documents(title, type)` | `documents(title, type)` |
| `linkRoute.group(title, routes)` | `group(title, routes)` |

Field-level overrides still use `options.routes`:

```ts
defineField({
  name: 'link',
  type: 'link',
  options: {
    routes: [
      route('Contact', '/contact'),
      documents('Products', 'product'),
    ],
  },
})
```

### Checklist

- [ ] Swap the npm package
- [ ] Replace `linkPlugin` with `linkPicker`
- [ ] Move `routes` out of the options object into the first argument
- [ ] Replace `linkRoute.*` with `route` / `documents` / `group`
- [ ] Restart Studio and smoke-test the link picker
