import assert from 'node:assert/strict'
const playwright = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core'
)

const { chromium } = playwright

let specState = 'completed'
let documentId = 9
let outcome = 200
let mutations = []
let reviewMutations = []
let agreed = true
let consentPosts = 0
const reviewFeatures = [
  {
    featureId: 101,
    name: '프로젝트 생성',
    reviewStatus: 'UNREVIEWED',
    sourcePageStart: 3,
    sourcePageEnd: 4,
    requirements: [
      {
        requirementId: 1001,
        content: '사용자는 프로젝트를 생성할 수 있다.',
        sourceText: '새 프로젝트를 만들고 이름을 입력한다.',
      },
    ],
    issues: [
      {
        issueType: 'DUPLICATE_SUSPECTED',
        description: '프로젝트 등록 기능과 요구사항이 겹칩니다.',
      },
      {
        issueType: 'SPLIT_RECOMMENDED',
        description: '생성과 초기 설정을 나눌 수 있습니다.',
      },
    ],
    duplicateCandidates: [
      {
        targetFeatureId: 102,
        targetFeatureName: '프로젝트 등록',
        targetSourcePageStart: 5,
        targetSourcePageEnd: 5,
        targetRequirements: [],
        reason: '같은 프로젝트 생성 흐름을 설명합니다.',
        suggestedMergedName: '프로젝트 생성',
        suggestedSection: '프로젝트',
      },
    ],
    splitSuggestions: [
      {
        suggestionId: 301,
        suggestedName: '프로젝트 생성',
        suggestedSection: '프로젝트',
        requirements: [
          {
            requirementId: 1001,
            content: '사용자는 프로젝트를 생성할 수 있다.',
            sourceText: '새 프로젝트를 만들고 이름을 입력한다.',
          },
        ],
      },
      {
        suggestionId: 302,
        suggestedName: '프로젝트 초기 설정',
        suggestedSection: '프로젝트',
        requirements: [],
      },
    ],
  },
  {
    featureId: 102,
    name: '프로젝트 등록',
    reviewStatus: 'UNREVIEWED',
    sourcePageStart: 5,
    sourcePageEnd: 5,
    requirements: [],
    issues: [],
    duplicateCandidates: [],
    splitSuggestions: [],
  },
  {
    featureId: 103,
    name: '저장소 연결',
    reviewStatus: 'USER_CONFIRMED',
    sourcePageStart: 7,
    sourcePageEnd: 7,
    requirements: [
      {
        requirementId: 1003,
        content: 'GitHub 저장소를 연결한다.',
        sourceText: null,
      },
    ],
    issues: [],
    duplicateCandidates: [],
    splitSuggestions: [],
  },
]
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
  if (/^\/feature-specs\/\d+\/review-summary$/.test(url.pathname)) {
    const reviewRequired = reviewFeatures.filter(
      (feature) =>
        feature.reviewStatus === 'UNREVIEWED' && feature.issues.length > 0,
    ).length
    const noIssue = reviewFeatures.filter(
      (feature) =>
        feature.reviewStatus === 'UNREVIEWED' && feature.issues.length === 0,
    ).length
    return ok({
      reviewRequired,
      noIssue,
      reviewed: reviewFeatures.length - reviewRequired - noIssue,
      total: reviewFeatures.length,
    })
  }
  const confirmMatch = url.pathname.match(
    /^\/feature-specs\/\d+\/features\/(\d+)\/confirm$/,
  )
  if (confirmMatch && route.request().method() === 'POST') {
    const feature = reviewFeatures.find(
      (item) => item.featureId === Number(confirmMatch[1]),
    )
    reviewMutations.push({ method: 'POST', path: url.pathname })
    if (feature) {
      feature.reviewStatus = 'USER_CONFIRMED'
      feature.issues = []
      feature.duplicateCandidates = []
      feature.splitSuggestions = []
    }
    return ok({})
  }
  const updateMatch = url.pathname.match(
    /^\/feature-specs\/\d+\/features\/(\d+)$/,
  )
  if (updateMatch && route.request().method() === 'PATCH') {
    const body = route.request().postDataJSON()
    const feature = reviewFeatures.find(
      (item) => item.featureId === Number(updateMatch[1]),
    )
    reviewMutations.push({ method: 'PATCH', path: url.pathname, body })
    if (feature) {
      feature.name = body.name
      feature.requirements = body.requirements.map((requirement, index) => ({
        requirementId: requirement.id ?? 2000 + index,
        content: requirement.content,
        sourceText: null,
      }))
      feature.reviewStatus = 'USER_MODIFIED'
      feature.issues = []
      feature.duplicateCandidates = []
      feature.splitSuggestions = []
    }
    return ok({})
  }
  if (/^\/feature-specs\/\d+\/features$/.test(url.pathname)) {
    const filter = url.searchParams.get('filter')
    const features =
      filter === 'REVIEW_REQUIRED'
        ? [reviewFeatures[0]]
        : filter === 'NO_ISSUE'
          ? [reviewFeatures[1]]
          : filter === 'REVIEWED'
            ? [reviewFeatures[2]]
            : reviewFeatures
    return ok({
      sections: [{ sectionId: 11, title: '프로젝트', features }],
    })
  }
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
  const uploadBox = await page
    .getByText('PDF 파일을 끌어다 놓거나', { exact: true })
    .boundingBox()
  const filterBox = await page
    .locator('[aria-label="기능 검토 필터"]')
    .boundingBox()
  assert.ok(uploadBox && filterBox && uploadBox.y < filterBox.y)
  await pick()
  await page.getByRole('button', { name: '교체', exact: true }).click()
  await waitText('기존 추출 결과와 검토 기록')
}
try {
  await open()
  await waitText('기능 3개를 추출했습니다')
  await page.getByRole('button', { name: '확인 필요 1', exact: true }).click()
  await waitText('프로젝트 등록 기능과 요구사항이 겹칩니다.')
  assert.ok(page.url().includes('review=required'))
  await page.getByRole('button', { name: '중복 기능 병합' }).click()
  await page.getByRole('heading', { name: '중복 기능 병합' }).waitFor()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await page.getByRole('button', { name: '추천안대로 분리' }).click()
  await page.getByRole('heading', { name: '추천안대로 기능 분리' }).waitFor()
  assert.equal(await page.getByLabel(/분리 기능/).count(), 2)
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await page.getByRole('button', { name: '전체 3', exact: true }).click()
  assert.equal(page.url().includes('review='), false)
  await page
    .getByRole('heading', { name: '프로젝트 생성', exact: true })
    .click()
  await page
    .getByRole('button', { name: '현재 내용으로 승인', exact: true })
    .click()
  await waitText('현재 내용으로 승인했습니다.')
  assert.deepEqual(reviewMutations[0], {
    method: 'POST',
    path: '/feature-specs/9/features/101/confirm',
  })
  await page
    .getByRole('heading', { name: '프로젝트 생성', exact: true })
    .click()
  await page.getByRole('button', { name: '수정', exact: true }).first().click()
  await page.getByLabel('기능명', { exact: true }).fill('프로젝트 만들기')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await waitText('기능을 수정했습니다.')
  assert.equal(reviewMutations[1].method, 'PATCH')
  assert.equal(reviewMutations[1].body.name, '프로젝트 만들기')
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
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  )
  await page.screenshot({
    path: '/private/tmp/galpi-feature-review-mobile.png',
    fullPage: true,
  })
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
