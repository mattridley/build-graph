import { expect, test } from '@playwright/test'

test('renders and navigates the investigation dashboard without browser errors', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.goto('/')

  await expect(page).toHaveTitle('BuildGraph')
  await expect(page.getByRole('heading', { name: 'BuildGraph' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Atlas release graph' }),
  ).toBeVisible()
  await expect(page.getByText(/SYNTHETIC DEMO/)).toBeVisible()
  await expect(page.getByText('42%')).toBeVisible()
  await expect(page.getByLabel('Your Vercel AI Gateway key')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: /Select Atlas v1 release/ }),
  ).toBeVisible()

  await page.setViewportSize({ width: 780, height: 900 })
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(
    page.getByRole('heading', { name: 'Ask delivery risk' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Forecast' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Atlas is at risk for the target date.',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Graph' }).click()
  await expect(
    page.getByRole('heading', { name: 'Atlas release graph' }),
  ).toBeVisible()
  expect(browserErrors).toEqual([])
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
