import assert from 'node:assert/strict'
const playwright = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core'
)

const { chromium } = playwright

let specState = 'completed'
let documentId = 9
let outcome = 200
let mutations = []
let agreed = true
let consentPosts = 0
const project = () => ({
  id: 7,
  name: '갈피 프론트엔드',
  status: 'ACTIVE',
  onboardingStep: 'COMPLETED',
  repositories: [
    {
      repositoryId: 2,
      fullName: 'galpiii/frontend',
      private: true,
      defaultBranch: 'develop',
      accessStatus: 'ACTIVE',
      lastSyncedAt: '2026-10-04T00:00:00Z',
    },
  ],
  lastAnalysis: null,
  specDocument:
    specState === 'empty'
      ? null
      : {
          specDocumentId: documentId,
          fileName: 'galpi-feature-specification.pdf',
          extractionStatus:
            specState === 'processing'
              ? 'PROCESSING'
              : specState === 'failed'
                ? 'FAILED'
                : 'COMPLETED',
        },
})

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.route('http://localhost:8080/**', async (route) => {
  const url = new URL(route.request().url())
  const ok = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    })
  if (url.pathname === '/auth/refresh')
    return ok({ accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 })
  if (url.pathname === '/consents/ai-data') {
    if (route.request().method() === 'POST') {
      agreed = true
      consentPosts++
    }
    return ok({
      currentVersion: 'v1',
      notice: '동의 안내',
      agreed,
      agreedVersion: agreed ? 'v1' : null,
    })
  }
  if (url.pathname === '/projects/7/feature-specs') {
    mutations.push(route.request().method())
    if (outcome === 'network') return route.abort('failed')
    if (outcome === 200) {
      documentId++
      specState = 'processing'
    }
    return ok({}, outcome)
  }
  if (url.pathname === '/projects/7') return ok(project())
  if (url.pathname === '/projects/7/pull-requests/summary')
    return ok({
      totalCount: 0,
      failedCount: 0,
      pendingCount: 0,
      repositories: [
        {
          id: 2,
          fullName: 'galpiii/frontend',
          pullRequestCount: 0,
          failedCount: 0,
        },
      ],
    })
  if (url.pathname === '/projects/7/pull-requests')
    return ok({ totalElements: 0, totalPages: 0, pullRequests: [] })
  if (url.pathname === '/projects/7/analyses/repositories') return ok([])
  return route.fulfill({ status: 404, body: '{}' })
})

const origin = process.env.FRONTEND_URL || 'http://127.0.0.1:5173'
const waitText = (text) =>
  page.getByText(text, { exact: false }).first().waitFor()
const pick = () =>
  page.getByLabel('기능명세서 PDF 선택').setInputFiles({
    name: 'new.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fixture'),
  })
async function open() {
  await page.goto(`${origin}/project/7?tab=match`)
  await page.getByRole('heading', { name: '기능대조', exact: true }).waitFor()
}
async function prepareReplacement() {
  await page
    .getByRole('button', { name: '기능명세서 교체', exact: true })
    .click()
  await pick()
  await page.getByRole('button', { name: '교체', exact: true }).click()
  await waitText('기존 추출 결과와 검토 기록')
}
try {
  await open()
  await prepareReplacement()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  assert.equal(mutations.length, 0)
  await page.getByRole('button', { name: '교체', exact: true }).click()
  await page.getByRole('button', { name: '기존 결과를 삭제하고 교체' }).click()
  await waitText('서버에서 새 기능명세서를 확인했습니다.')
  assert.equal(
    await page
      .getByRole('button', { name: '서버 상태 확인', exact: true })
      .count(),
    0,
  )
  assert.deepEqual(mutations, ['PUT'])
  assert.equal(consentPosts, 0)

  // Clear in-memory state with a fresh page for each independent outcome.
  for (const result of [400, 409, 503, 'network']) {
    specState = 'completed'
    outcome = result
    mutations = []
    await open()
    await prepareReplacement()
    await page
      .getByRole('button', { name: '기존 결과를 삭제하고 교체' })
      .click()
    if (result === 400 || result === 409) {
      await waitText(
        result === 400
          ? 'PDF 파일을 읽을 수 없습니다.'
          : '기능 추출 중이거나 문서가 변경되어',
      )
      assert.equal(
        await page
          .getByRole('button', { name: '교체', exact: true })
          .isEnabled(),
        true,
      )
    } else {
      await waitText('접수 여부가 불확실합니다.')
      assert.equal(
        await page
          .getByRole('button', { name: '서버 상태 확인', exact: true })
          .count(),
        0,
      )
      assert.equal(
        await page
          .getByRole('button', { name: '기능명세서 교체', exact: true })
          .isDisabled(),
        true,
      )
      // Unmount the feature view through SPA navigation and restore it.
      await page
        .getByRole('link', { name: '프로젝트 개요', exact: true })
        .click()
      await page.getByRole('link', { name: '기능대조', exact: true }).click()
      assert.equal(
        await page
          .getByRole('button', { name: '기능명세서 교체', exact: true })
          .isDisabled(),
        true,
      )
    }
    assert.deepEqual(mutations, ['PUT'])
  }

  specState = 'empty'
  outcome = 200
  mutations = []
  agreed = false
  await open()
  await pick()
  await page.getByRole('button', { name: '업로드하고 분석하기' }).click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('checkbox') })
  await dialog.waitFor()
  assert.equal(mutations.length, 0)
  const checks = dialog.getByRole('checkbox')
  assert.equal(await checks.count(), 2)
  await checks.nth(0).check()
  await checks.nth(1).check()
  await dialog.getByRole('button', { name: /동의하고/ }).click()
  await waitText('서버에서 새 기능명세서를 확인했습니다.')
  assert.deepEqual(mutations, ['POST'])
  assert.equal(consentPosts, 1)

  specState = 'completed'
  await page.setViewportSize({ width: 390, height: 844 })
  await open()
  await prepareReplacement()
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  )
  await page.screenshot({
    path: '/private/tmp/galpi-replacement-mobile.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  assert.equal(
    await page
      .getByRole('button', { name: '교체', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  )
  console.log('Replacement and upload browser regression passed')
} finally {
  await browser.close()
}
