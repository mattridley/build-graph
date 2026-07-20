import { expect, test } from '@playwright/test'

test('renders the BuildGraph application shell', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('BuildGraph')
  await expect(
    page.getByRole('heading', {
      name: 'Delivery risk, mapped and explained.',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Atlas release graph' }),
  ).toBeVisible()
  await expect(page.getByText('SYNTHETIC DEMO')).toBeVisible()
})

test('returns a sanitized health response without runtime configuration', async ({
  request,
}) => {
  const response = await request.get('/api/health')

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toEqual({
    application: {
      name: 'build-graph',
      status: 'ok',
      version: '0.1.0',
    },
    dependencies: {
      clickhouse: {
        configured: false,
        reachability: 'not_configured',
      },
      postgres: {
        configured: false,
        reachability: 'not_configured',
      },
      trigger: {
        configured: false,
        reachability: 'not_configured',
      },
    },
  })
})
