/**
 * Smoke tests for the link and anchor inputs in the dev Studio, against a mocked Content Lake
 * (see mock-api.ts). They check behaviour, not pixels: what the inputs show and offer.
 */

import {expect, type Locator, type Page, test} from '@playwright/test'

import {mockContentLake} from './mock-api'

const ANCHOR_PLACEHOLDER = 'Search sections or type #my-section'

test.beforeEach(async ({page}) => {
  await mockContentLake(page)
})

/** Opens a document and waits until its form is editable. */
async function openDocument(page: Page, path: string, field: string): Promise<Locator> {
  await page.goto(path)
  const container = page.getByTestId(`field-${field}`)
  await expect(container).toBeVisible({timeout: 90_000})
  await expect(container.locator('input').first()).toBeEditable({timeout: 60_000})
  return container
}

/** Focuses a picker input and opens its listbox. */
async function openPicker(input: Locator): Promise<void> {
  await input.focus()
  if ((await input.getAttribute('aria-expanded')) !== 'true') await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
}

const option = (page: Page, key: string) => page.locator(`[data-option-key="${key}"]`).first()

test.describe('link input', () => {
  test('shows preset routes and email links as cards that open for editing', async ({page}) => {
    await openDocument(page, '/default/structure/linkDemo;link-demo', 'title')

    const preset = page.getByTestId('field-pathLink').getByRole('button', {name: 'Edit link'})
    await expect(preset).toContainText('Home')

    const email = page.getByTestId('field-emailLink').getByRole('button', {name: 'Edit link'})
    await expect(email).toContainText('hello@example.com')
    await email.click()
    await expect(
      page.getByTestId('field-emailLink').locator('input[value="mailto:hello@example.com"]'),
    ).toBeFocused()
  })

  test('offers routes, and the typed text as a link', async ({page}) => {
    await openDocument(page, '/default/structure/linkDemo;link-demo', 'title')
    const input = page.getByTestId('field-emptyLink').getByPlaceholder('Search or paste a link')
    await openPicker(input)
    await expect(page.getByRole('option', {name: /All products/})).toBeVisible()

    await input.fill('example.com')
    await expect(option(page, 'link:https://example.com')).toBeVisible()
  })
})

test.describe('anchor input', () => {
  test("inside a link to a page, lists that page's sections", async ({page}) => {
    const link = await openDocument(page, '/anchors/structure/anchorDemo;anchor-picker', 'link')
    await openPicker(link.getByPlaceholder(ANCHOR_PLACEHOLDER))
    await expect(page.getByText('Sections on the linked page')).toBeVisible()
    await expect(option(page, 'doc:anchor-page-about-s3')).toBeVisible()
    await expect(option(page, 'doc:anchor-page-pricing-p2')).toHaveCount(0)
  })

  test('standalone, browses documents with sections and picks one', async ({page}) => {
    await openDocument(page, '/anchors/structure/anchorDemo;anchor-picker', 'link')
    const input = page.locator('[data-testid^="field-jumpTo"]').getByPlaceholder(ANCHOR_PLACEHOLDER)
    await openPicker(input)
    await option(page, 'sections:page-pricing').click()
    await option(page, 'doc:anchor-page-pricing-p2').click()
    await expect(page.getByText('#compare-plans').first()).toBeVisible()
  })

  test('inside a link to a URL, only offers a typed fragment', async ({page}) => {
    const link = await openDocument(page, '/anchors/structure/anchorDemo;anchor-url', 'link')
    const input = link.getByPlaceholder(ANCHOR_PLACEHOLDER)
    await openPicker(input)
    await expect(page.getByText('This link goes to a URL.')).toBeVisible()

    await input.fill('install')
    await expect(option(page, 'link:#install')).toBeVisible()
    await expect(page.locator('[data-option-key^="doc:"]')).toHaveCount(0)
  })
})

test.describe('validation', () => {
  /** Hovers the nth warning icon in scope and expects its message. */
  async function expectWarning(page: Page, scope: Locator, nth: number, message: string) {
    const icon = scope.getByTestId('input-validation-icon-warning').nth(nth)
    await expect(icon).toBeVisible({timeout: 30_000})
    await icon.hover()
    await expect(page.getByText(message)).toBeVisible()
    await page.mouse.move(0, 0)
  }

  test("warns about a section that isn't on the link's page", async ({page}) => {
    const link = await openDocument(page, '/anchors/structure/anchorDemo;anchor-other-page', 'link')
    await expectWarning(page, link, 0, "This section isn't on the page this link goes to")
  })

  test('warns about a deleted document and section', async ({page}) => {
    const link = await openDocument(page, '/anchors/structure/anchorDemo;anchor-deleted', 'link')
    await expect(link.getByText('Document not found')).toBeVisible()
    await expectWarning(page, link, 0, "The linked document doesn't exist anymore")
    await expect(page.getByText('Section not found')).toBeVisible()
    await expectWarning(page, page.locator('body'), 1, "This section doesn't exist anymore")
  })
})
