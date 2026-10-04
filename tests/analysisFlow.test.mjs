import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

async function modules(t) {
  const dir = await mkdtemp(join(tmpdir(), 'galpi-consent-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const file of [
    'lib/api',
    'auth/session',
    'lib/consentApi',
    'lib/projectApi',
    'lib/projectOverviewApi',
    'lib/pullRequestApi',
    'lib/featureSpecApi',
    'lib/featureReviewApi',
    'analysis/featureReview',
    'analysis/prRetry',
    'analysis/featureSpecUpload',
    'analysis/analysisFlow',
    'analysis/projectAnalysis',
  ]) {
    await mkdir(join(dir, file.split('/')[0]), { recursive: true })
    const source = await readFile(
      new URL(`../src/${file}.ts`, import.meta.url),
      'utf8',
    )
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
      },
    })
    await writeFile(
      join(dir, `${file}.mjs`),
      (file === 'lib/api'
        ? "import.meta.env = { VITE_API_BASE_URL: 'https://backend.example.test' };\n"
        : '') + outputText.replaceAll(".ts'", ".mjs'"),
    )
  }
  let result = {}
  for (const file of [
    'analysis/analysisFlow',
    'analysis/projectAnalysis',
    'lib/consentApi',
    'lib/projectApi',
    'lib/projectOverviewApi',
    'lib/pullRequestApi',
    'lib/featureSpecApi',
    'lib/featureReviewApi',
    'analysis/featureReview',
    'analysis/prRetry',
    'analysis/featureSpecUpload',
    'auth/session',
  ])
    result = {
      ...result,
      ...(await import(pathToFileURL(join(dir, `${file}.mjs`)))),
    }
  return result
}
const notice = {
  currentVersion: 'v1',
  agreed: false,
  agreedVersion: null,
  notice: '서버 고지\n외부 AI 전송 안내',
}
const run = { inaccessibleRepositoryCount: 0 }
const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function apis(overrides = {}) {
  return {
    get: async () => notice,
    agree: async () => ({ ...notice, agreed: true, agreedVersion: 'v1' }),
    start: async () => run,
    ...overrides,
  }
}

test('already agreed starts without consent POST; duplicate starts are ignored', async (t) => {
  const { AnalysisFlow } = await modules(t)
  let starts = 0
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () => ({ ...notice, agreed: true }),
      agree: () => assert.fail('no consent POST'),
      start: async (id) => {
        assert.equal(id, 42)
        starts++
        return run
      },
    }),
  )
  const pending = flow.start(42)
  assert.equal(await flow.start(43), null)
  assert.deepEqual(await pending, run)
  assert.equal(starts, 1)
})

test('first consent requires explicit checkbox and persists displayed version before one analysis', async (t) => {
  const { AnalysisFlow } = await modules(t)
  const calls = []
  const saving = deferred()
  const flow = new AnalysisFlow(
    () => {},
    apis({
      agree: async (version) => {
        calls.push(version)
        await saving.promise
        return { ...notice, agreed: true }
      },
      start: async () => {
        calls.push('analysis')
        return run
      },
    }),
  )
  const pending = flow.start(42)
  await tick()
  assert.equal(flow.state.phase, 'consent')
  assert.equal(flow.state.checked, false)
  await flow.confirm()
  assert.deepEqual(calls, [])
  flow.setChecked(true)
  const submit = flow.confirm()
  await flow.confirm()
  assert.deepEqual(calls, ['v1'])
  saving.resolve()
  await submit
  await pending
  assert.deepEqual(calls, ['v1', 'analysis'])
})

test('cancel during lookup or save ignores late responses and never starts analysis', async (t) => {
  const { AnalysisFlow } = await modules(t)
  for (const phase of ['lookup', 'save']) {
    const waiting = deferred()
    const flow = new AnalysisFlow(
      () => {},
      apis({
        get: async () => {
          if (phase === 'lookup') await waiting.promise
          return notice
        },
        agree: async () => {
          await waiting.promise
          return notice
        },
        start: () => assert.fail('cancelled'),
      }),
    )
    const pending = flow.start(1)
    await tick()
    if (phase === 'save') {
      flow.setChecked(true)
      void flow.confirm()
    }
    flow.cancel()
    assert.equal(await pending, null)
    waiting.resolve()
    await tick()
    assert.equal(flow.state.phase, 'idle')
  }
})

test('version conflict fetches new notice and resets checkbox before resubmitting', async (t) => {
  const { AnalysisFlow, ConsentVersionChanged } = await modules(t)
  let gets = 0
  const versions = []
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () =>
        ++gets === 1
          ? notice
          : {
              ...notice,
              currentVersion: 'v2',
              agreedVersion: 'v1',
              notice: '변경된 고지',
            },
      agree: async (version) => {
        versions.push(version)
        if (version === 'v1') throw new ConsentVersionChanged()
        return notice
      },
    }),
  )
  const pending = flow.start(1)
  await tick()
  flow.setChecked(true)
  await flow.confirm()
  assert.equal(flow.state.checked, false)
  assert.equal(flow.state.consent.notice, '변경된 고지')
  await flow.confirm()
  assert.deepEqual(versions, ['v1'])
  flow.setChecked(true)
  await flow.confirm()
  await pending
  assert.deepEqual(versions, ['v1', 'v2'])
})

test('CONSENT-001 race returns to consent, with no automatic analysis replay', async (t) => {
  const { AnalysisFlow, ConsentRequired } = await modules(t)
  let starts = 0
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () => ({ ...notice, agreed: true }),
      start: async () => {
        if (++starts === 1) throw new ConsentRequired()
        return run
      },
    }),
  )
  const pending = flow.start(1)
  await tick()
  assert.equal(flow.state.phase, 'consent')
  assert.equal(starts, 1)
  flow.setChecked(true)
  await flow.confirm()
  await pending
  assert.equal(starts, 2)
})

test('preflight failures are retryable without analysis; cancel preserves linked resources', async (t) => {
  const { AnalysisFlow } = await modules(t)
  let gets = 0
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () => {
        if (++gets === 1) throw new Error('network')
        return notice
      },
      agree: async () => {
        throw new Error('network')
      },
      start: () => assert.fail('no analysis'),
    }),
  )
  const pending = flow.start(1)
  await tick()
  assert.equal(flow.state.phase, 'error')
  flow.retry()
  await tick()
  flow.setChecked(true)
  await flow.confirm()
  assert.equal(flow.state.phase, 'error')
  // The flow only operates on consent and analysis APIs, never repository mutations.
  flow.cancel()
  assert.equal(await pending, null)
})

test('analysis timeout and confirmed rejection propagate once, never auto-retry', async (t) => {
  const { AnalysisFlow, AnalysisRequestRejected } = await modules(t)
  for (const error of [new Error('timeout'), new AnalysisRequestRejected()]) {
    let calls = 0
    const flow = new AnalysisFlow(
      () => {},
      apis({
        get: async () => ({ ...notice, agreed: true }),
        start: async () => {
          calls++
          throw error
        },
      }),
    )
    await assert.rejects(flow.start(1), (e) => e === error)
    assert.equal(calls, 1)
    assert.equal(flow.state.phase, 'idle')
  }
})

test('unmount invalidates pending responses without notifying UI', async (t) => {
  const { AnalysisFlow } = await modules(t)
  const waiting = deferred()
  let updates = 0
  const flow = new AnalysisFlow(
    () => updates++,
    apis({
      get: async () => {
        await waiting.promise
        return { ...notice, agreed: true }
      },
      start: () => assert.fail('unmounted'),
    }),
  )
  const pending = flow.start(1)
  flow.cancel(true)
  const before = updates
  waiting.resolve()
  assert.equal(await pending, null)
  await tick()
  assert.equal(updates, before)
  assert.equal(flow.disposed, true)
})

test('real API wrappers send correct version and distinguish consent codes from other failures', async (t) => {
  const {
    exchangeLoginCode,
    getAiConsent,
    agreeAiConsent,
    startProjectAnalysis,
    ConsentRequired,
    ConsentVersionChanged,
    AnalysisRequestRejected,
  } = await modules(t)
  const requests = []
  let reply = Response.json({ data: notice })
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    if (url.endsWith('/auth/token'))
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    return reply.clone()
  })
  await exchangeLoginCode('fixture')
  assert.deepEqual(await getAiConsent(), notice)
  reply = Response.json({
    data: { ...notice, agreed: true, agreedVersion: 'v1' },
  })
  await agreeAiConsent('v1')
  assert.equal(
    requests.at(-1).url,
    'https://backend.example.test/consents/ai-data',
  )
  assert.deepEqual(JSON.parse(requests.at(-1).init.body), {
    consentVersion: 'v1',
  })
  reply = Response.json({ code: 'CONSENT-002' }, { status: 409 })
  await assert.rejects(agreeAiConsent('v1'), ConsentVersionChanged)
  reply = Response.json({ code: 'CONSENT-001' }, { status: 403 })
  await assert.rejects(startProjectAnalysis(1), ConsentRequired)
  reply = Response.json({ code: 'OTHER' }, { status: 403 })
  await assert.rejects(startProjectAnalysis(1), AnalysisRequestRejected)
  for (const status of [408, 409, 425]) {
    reply = Response.json({}, { status })
    await assert.rejects(
      startProjectAnalysis(1),
      (e) => !(e instanceof AnalysisRequestRejected),
    )
  }
  reply = Response.json({}, { status: 503 })
  await assert.rejects(
    startProjectAnalysis(1),
    (e) => !(e instanceof AnalysisRequestRejected),
  )
  reply = Response.json({ data: { ...notice, notice: '' } })
  await assert.rejects(getAiConsent(), /동의 정보를 확인/)
})

test('consent-only gate must finish before linking; cancel never links or starts analysis', async (t) => {
  const { AnalysisFlow } = await modules(t)
  const calls = []
  const flow = new AnalysisFlow(
    () => {},
    apis({
      agree: async () => {
        calls.push('consent')
        return notice
      },
      start: () => assert.fail('Consent gate cannot start analysis'),
    }),
  )
  async function connect() {
    if (await flow.requestConsent()) calls.push('link')
  }
  const cancelled = connect()
  await tick()
  assert.equal(flow.consentOnly, true)
  assert.deepEqual(calls, [])
  flow.cancel()
  await cancelled
  assert.deepEqual(calls, [])
  const accepted = connect()
  await tick()
  flow.setChecked(true)
  await flow.confirm()
  await accepted
  assert.deepEqual(calls, ['consent', 'link'])
})

test('existing agreement skips PDF consent on subsequent projects without another POST or modal', async (t) => {
  const { AnalysisFlow } = await modules(t)
  let agreed = false
  let saves = 0
  const phases = []
  const api = apis({
    get: async () => ({ ...notice, agreed }),
    agree: async () => {
      saves++
      agreed = true
      return { ...notice, agreed: true }
    },
    start: () => assert.fail('no repository analysis'),
  })
  const first = new AnalysisFlow(() => {}, api)
  const pending = first.requestConsent('feature-spec')
  await tick()
  assert.equal(first.state.phase, 'consent')
  first.setChecked(true)
  await first.confirm()
  assert.equal(await pending, true)
  const second = new AnalysisFlow((state) => phases.push(state.phase), api)
  assert.equal(await second.requestConsent('feature-spec'), true)
  assert.equal(saves, 1)
  assert.deepEqual(phases, ['checking', 'idle'])
})

test('PDF consent waits for a scoped agreement and never starts repository analysis', async (t) => {
  const { AnalysisFlow } = await modules(t)
  const scoped = { ...notice, coveredData: ['FEATURE_SPEC_DOCUMENT'] }
  const calls = []
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () => scoped,
      agree: async (version) => {
        calls.push(version)
        return { ...scoped, agreed: true }
      },
      start: () => assert.fail('consent-only gate'),
    }),
  )
  const pending = flow.requestConsent('feature-spec')
  await tick()
  assert.equal(flow.state.phase, 'consent')
  await flow.confirm()
  assert.deepEqual(calls, [])
  flow.setChecked(true)
  await flow.confirm()
  assert.equal(await pending, true)
  assert.deepEqual(calls, ['v1'])
})

test('PDF version conflict requires confirmation again without requiring coveredData', async (t) => {
  const { AnalysisFlow, ConsentVersionChanged } = await modules(t)
  let saves = 0
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () => ({ ...notice, currentVersion: saves ? 'v2' : 'v1' }),
      agree: async () => {
        if (++saves === 1) throw new ConsentVersionChanged()
        return notice
      },
    }),
  )
  const pending = flow.requestConsent('feature-spec')
  await tick()
  flow.setChecked(true)
  await flow.confirm()
  assert.equal(flow.state.phase, 'consent')
  assert.equal(flow.state.checked, false)
  assert.equal(flow.state.consent.currentVersion, 'v2')
  flow.setChecked(true)
  await flow.confirm()
  assert.equal(await pending, true)
})

test('cancelled PDF consent ignores a late agreement response', async (t) => {
  const { AnalysisFlow } = await modules(t)
  const saving = deferred()
  const scoped = { ...notice, coveredData: ['FEATURE_SPEC_DOCUMENT'] }
  const flow = new AnalysisFlow(
    () => {},
    apis({
      get: async () => scoped,
      agree: async () => {
        await saving.promise
        return scoped
      },
    }),
  )
  const pending = flow.requestConsent('feature-spec')
  await tick()
  flow.setChecked(true)
  const submission = flow.confirm()
  flow.cancel()
  assert.equal(await pending, false)
  saving.resolve()
  await submission
  assert.equal(flow.state.phase, 'idle')
})

const projectFixture = (lastAnalysis = null) => ({
  id: 7,
  name: 'Galpi',
  status: 'ACTIVE',
  onboardingStep: 'COMPLETED',
  repositories: [{ repositoryId: 1, fullName: 'galpi/frontend' }],
  specDocument: null,
  lastAnalysis,
})

test('navigation intent is synchronous; delayed POST survives remount/StrictMode consumption exactly once', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  const waiting = deferred()
  let posts = 0
  let latest = null
  const store = new ProjectAnalysisStore({
    get: async () => projectFixture(latest),
    start: async () => {
      posts++
      await waiting.promise
      latest = { analysisRunId: 8, status: 'QUEUED' }
      return run
    },
  })
  store.queue(7)
  assert.equal(store.get(7).phase, 'queued')
  assert.equal(posts, 0) // connector can navigate before any POST
  const pending = store.consume(7)
  await tick()
  const unsubscribe = store.subscribe(() => {})
  unsubscribe() // navigating away cannot abort the owner
  await store.consume(7)
  store.queue(7)
  await store.consume(7)
  assert.equal(store.get(7).phase, 'requesting')
  assert.equal(posts, 1)
  waiting.resolve()
  await pending
  assert.equal(store.get(7).phase, 'confirmed')
  assert.equal(store.get(7).project.lastAnalysis.status, 'QUEUED')
  latest = { analysisRunId: 8, status: 'RUNNING' }
  await store.refresh(7)
  assert.equal(store.get(7).project.lastAnalysis.status, 'RUNNING')
  latest = { analysisRunId: 8, status: 'COMPLETED' }
  await store.refresh(7)
  assert.equal(store.get(7).project.lastAnalysis.status, 'COMPLETED')
  assert.equal(posts, 1)
})

test('explicit rejection permits one manual retry and preserves linked repositories', async (t) => {
  const { ProjectAnalysisStore, AnalysisRequestRejected } = await modules(t)
  let posts = 0
  const store = new ProjectAnalysisStore({
    get: async () => projectFixture(),
    start: async () => {
      if (++posts === 1) throw new AnalysisRequestRejected()
      return run
    },
  })
  store.queue(7)
  await store.consume(7)
  assert.equal(store.get(7).phase, 'rejected')
  assert.equal(store.get(7).project.repositories.length, 1)
  await store.refresh(7)
  assert.equal(posts, 1)
  store.retry(7)
  store.retry(7)
  await tick()
  assert.equal(posts, 2)
  assert.equal(store.get(7).phase, 'confirmed')
})

test('ambiguous failure never replays; old completed run is not mistaken for new acceptance', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  for (const error of [
    new Error('network'),
    new DOMException('timeout', 'TimeoutError'),
    new Error('503'),
  ]) {
    let posts = 0
    let latest = { analysisRunId: 4, status: 'COMPLETED' }
    const store = new ProjectAnalysisStore({
      get: async () => projectFixture(latest),
      start: async () => {
        posts++
        throw error
      },
    })
    store.queue(7)
    await store.consume(7)
    assert.equal(store.get(7).phase, 'unknown')
    store.retry(7)
    store.queue(7)
    await store.consume(7)
    await store.refresh(7)
    assert.equal(posts, 1)
    assert.equal(store.get(7).phase, 'unknown')
    latest = { analysisRunId: 5, status: 'COMPLETED' }
    await store.refresh(7)
    assert.equal(store.get(7).phase, 'confirmed')
    assert.equal(posts, 1)
  }
})

test('reload only restores server state; no pending intent is persisted or inferred', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  for (const latest of [
    null,
    { analysisRunId: 8, status: 'RUNNING' },
    { analysisRunId: 8, status: 'FAILED' },
  ]) {
    const store = new ProjectAnalysisStore({
      get: async () => projectFixture(latest),
      start: () => assert.fail('reload must never POST'),
    })
    await store.consume(7)
    await store.refresh(7)
    assert.deepEqual(store.get(7).project.lastAnalysis, latest)
  }
})

test('preflight catches already-running analysis and deduplicates overlapping status reads', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  let reads = 0
  const store = new ProjectAnalysisStore({
    get: async () => {
      reads++
      return projectFixture({ analysisRunId: 8, status: 'RUNNING' })
    },
    start: () => assert.fail('already running'),
  })
  store.queue(7)
  await store.consume(7)
  assert.equal(store.get(7).phase, 'confirmed')
  const before = reads
  await Promise.all([store.refresh(7), store.refresh(7), store.refresh(7)])
  assert.equal(reads, before + 1)
})

test('status lookup failure does not authorize retry of an ambiguous request', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  let reads = 0
  let posts = 0
  const store = new ProjectAnalysisStore({
    get: async () => {
      if (++reads > 1) throw new Error('offline')
      return projectFixture()
    },
    start: async () => {
      posts++
      throw new Error('timeout')
    },
  })
  store.queue(7)
  await store.consume(7)
  assert.equal(store.get(7).phase, 'unknown')
  assert.ok(store.get(7).error)
  await store.refresh(7)
  store.retry(7)
  assert.equal(posts, 1)
})

test('a status read started before a new intent cannot overwrite its baseline', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  const oldRead = deferred()
  const waiting = deferred()
  let reads = 0
  const store = new ProjectAnalysisStore({
    get: async () =>
      ++reads === 1
        ? oldRead.promise
        : projectFixture({ analysisRunId: 5, status: 'COMPLETED' }),
    start: async () => {
      await waiting.promise
      return run
    },
  })
  const reading = store.refresh(7)
  store.queue(7)
  const posting = store.consume(7)
  await tick()
  oldRead.resolve(projectFixture({ analysisRunId: 4, status: 'RUNNING' }))
  await reading
  assert.equal(store.get(7).project.lastAnalysis.analysisRunId, 5)
  assert.equal(store.get(7).phase, 'requesting')
  waiting.resolve()
  await posting
})

test('failed preflight is retryable but dispatches nothing', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  const store = new ProjectAnalysisStore({
    get: async () => {
      throw new Error('offline')
    },
    start: () => assert.fail('no POST after failed preflight'),
  })
  store.queue(7)
  await store.consume(7)
  assert.equal(store.get(7).phase, 'rejected')
  assert.equal(store.get(7).preflightFailed, true)
})

test('overview uses filtered server totals for completed counts, not total minus failed', async (t) => {
  const { exchangeLoginCode, loadOverview } = await modules(t)
  const paths = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(url)
    paths.push(u.pathname + u.search)
    if (u.pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    if (u.pathname.endsWith('/summary'))
      return Response.json({
        data: {
          totalCount: 20,
          failedCount: 2,
          pendingCount: 10,
          repositories: [
            {
              id: 1,
              fullName: 'galpi/frontend',
              pullRequestCount: 20,
              failedCount: 2,
            },
          ],
        },
      })
    if (u.pathname === '/projects/7/analyses/repositories')
      return Response.json({
        data: [
          {
            repositoryId: 1,
            analysisRunId: 8,
            status: 'COMPLETED',
            incompleteReasons: ['PATCH_OMITTED'],
          },
        ],
      })
    assert.equal(u.searchParams.get('analysisStatus'), 'COMPLETED')
    assert.equal(u.searchParams.get('size'), '1')
    return Response.json({
      data: { totalElements: 8, totalPages: 8, pullRequests: [] },
    })
  })
  await exchangeLoginCode('fixture')
  const data = await loadOverview(7, [1], 8, new AbortController().signal)
  assert.equal(data.completed, 8)
  assert.equal(data.repositoryCompleted[1], 8)
  assert.equal(data.overview.totalCount, 20)
  assert.equal(data.partial, false)
  assert.deepEqual(data.repositoryStatuses[0].incompleteReasons, [
    'PATCH_OMITTED',
  ])
  assert.ok(paths.some((p) => p.includes('repositoryId=1')))
})

test('overview partial failures preserve available facts and never report missing counts as zero', async (t) => {
  const { exchangeLoginCode, loadOverview } = await modules(t)
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(url)
    if (u.pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    if (u.pathname.endsWith('/summary'))
      return Response.json({}, { status: 503 })
    if (u.searchParams.get('repositoryId') === '2')
      return Response.json({
        data: { totalElements: -1, totalPages: 0, pullRequests: [] },
      })
    return Response.json({
      data: { totalElements: 4, totalPages: 4, pullRequests: [] },
    })
  })
  await exchangeLoginCode('fixture')
  const data = await loadOverview(
    7,
    [1, 2],
    undefined,
    new AbortController().signal,
  )
  assert.equal(data.overview, null)
  assert.equal(data.completed, 4)
  assert.equal(data.repositoryCompleted[1], 4)
  assert.equal(data.repositoryCompleted[2], undefined)
  assert.deepEqual(data.repositoryStatuses, [])
  assert.equal(data.partial, true)
})

test('PR filters and pagination use the existing endpoint and reject unsafe external links', async (t) => {
  const { exchangeLoginCode, getPrPage, githubUrl, displayDate } =
    await modules(t)
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(url)
    if (u.pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    assert.equal(u.pathname, '/projects/7/pull-requests')
    assert.equal(u.searchParams.get('page'), '2')
    assert.equal(u.searchParams.get('repositoryId'), '1')
    assert.equal(u.searchParams.get('analysisStatus'), 'FAILED')
    return Response.json({
      data: { totalElements: 0, totalPages: 0, pullRequests: [] },
    })
  })
  await exchangeLoginCode('fixture')
  await getPrPage(7, {
    repositoryId: 1,
    analysisStatus: 'FAILED',
    page: 2,
    size: 20,
  })
  assert.equal(githubUrl('javascript:alert(1)'), undefined)
  assert.equal(githubUrl('https://github.com.evil.test/pr'), undefined)
  assert.equal(
    githubUrl('https://github.com/galpi/frontend/pull/1'),
    'https://github.com/galpi/frontend/pull/1',
  )
  assert.equal(displayDate('invalid'), '기록 없음')
})

test('selected analysis and its manual retry preserve the exact newly-linked repository scope', async (t) => {
  const { ProjectAnalysisStore, AnalysisRequestRejected } = await modules(t)
  const scopes = []
  const store = new ProjectAnalysisStore({
    get: async () => projectFixture(),
    start: async (id, signal, repositoryIds) => {
      scopes.push(repositoryIds)
      if (scopes.length === 1) throw new AnalysisRequestRejected()
      return run
    },
  })
  const selection = [2]
  store.queue(7, selection)
  selection.push(1) // caller mutation must not widen the intent
  await store.consume(7)
  store.retry(7)
  await tick()
  assert.deepEqual(scopes, [[2], [2]])
})

test('selected request never silently attaches to an existing project-wide run', async (t) => {
  const { ProjectAnalysisStore } = await modules(t)
  const store = new ProjectAnalysisStore({
    get: async () => projectFixture({ analysisRunId: 8, status: 'RUNNING' }),
    start: () => assert.fail('cannot change an in-flight run'),
  })
  store.queue(7, [2])
  await store.consume(7)
  assert.equal(store.get(7).phase, 'rejected')
  assert.equal(store.get(7).waitingForOtherRun, true)
})

test('selected endpoint sends internal IDs and never falls back to full analysis on old-server 404', async (t) => {
  const { exchangeLoginCode, startProjectAnalysis, AnalysisRequestRejected } =
    await modules(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/auth/token'))
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    requests.push({ url, body: init.body })
    return Response.json({}, { status: 404 })
  })
  await exchangeLoginCode('fixture')
  await assert.rejects(
    startProjectAnalysis(7, undefined, [2]),
    AnalysisRequestRejected,
  )
  assert.equal(requests.length, 1)
  assert.ok(requests[0].url.endsWith('/projects/7/analyses/selected'))
  assert.deepEqual(JSON.parse(requests[0].body), { repositoryIds: [2] })
  await assert.rejects(
    startProjectAnalysis(7, undefined, []),
    AnalysisRequestRejected,
  )
  assert.equal(requests.length, 1)
})

test('repository status restoration keeps the previous backend result during a frontend-only run', async (t) => {
  const { exchangeLoginCode, getRepositoryAnalysisStatuses } = await modules(t)
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/auth/token'))
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    assert.ok(url.endsWith('/projects/7/analyses/repositories'))
    return Response.json({
      data: [
        {
          repositoryId: 1,
          analysisRunId: 8,
          status: 'COMPLETED',
          incompleteReasons: [],
        },
        {
          repositoryId: 2,
          analysisRunId: 9,
          status: 'COLLECTING',
          incompleteReasons: [],
        },
      ],
    })
  })
  await exchangeLoginCode('fixture')
  const states = await getRepositoryAnalysisStatuses(7)
  assert.equal(states[0].status, 'COMPLETED')
  assert.equal(states[1].status, 'COLLECTING')
})

test('failed PR retry is deduplicated across drawer lifetimes and never recollects repositories', async (t) => {
  const { PrRetryStore } = await modules(t)
  const waiting = deferred()
  let posts = 0
  const store = new PrRetryStore(async (id, repositoryId) => {
    assert.equal(id, 7)
    assert.equal(repositoryId, 2)
    posts++
    await waiting.promise
    return { requeuedCount: 1 }
  })
  const pending = store.request(7, 2)
  const unsubscribe = store.subscribe(() => {})
  unsubscribe()
  await store.request(7, 2)
  assert.equal(posts, 1)
  waiting.resolve()
  await pending
  assert.equal(store.get(7).phase, 'success')
  store.allowAfterStatus(7, 1)
  assert.equal(store.get(7).phase, 'success')
  store.allowAfterStatus(7, 0)
  assert.equal(store.get(7).phase, 'idle')
})

test('uncertain PR retry cannot be resent even after status checks', async (t) => {
  const { PrRetryStore } = await modules(t)
  let posts = 0
  const store = new PrRetryStore(async () => {
    posts++
    throw new Error('timeout')
  })
  await store.request(7)
  store.allowAfterStatus(7, 0)
  await store.request(7)
  assert.equal(posts, 1)
  assert.equal(store.get(7).phase, 'unknown')
})

test('PR detail and failed-only retry use their dedicated endpoints', async (t) => {
  const {
    exchangeLoginCode,
    getPullRequestDetail,
    retryFailedPrs,
    PrRetryRejected,
  } = await modules(t)
  let reject = false
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const u = new URL(url)
    if (u.pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    if (u.pathname === '/pull-requests/99')
      return Response.json({
        data: {
          id: 99,
          number: 11,
          title: 'UI',
          body: null,
          state: 'MERGED',
          baseRef: 'main',
          createdAtGithub: null,
          mergedAt: null,
          htmlUrl: 'https://github.com/org/repo/pull/11',
          author: null,
          repository: { id: 2, fullName: 'org/repo' },
          files: [{ path: 'app.ts', patchOmitted: true }],
          filesTruncated: true,
          analysis: {
            status: 'COMPLETED',
            summary: '요약',
            changeType: 'FEATURE',
            analyzedAt: null,
            errorCode: null,
          },
          incompleteReasons: ['PATCH_OMITTED'],
        },
      })
    assert.equal(u.pathname, '/projects/7/pull-request-analyses/retry')
    assert.equal(u.searchParams.get('repositoryId'), '2')
    assert.equal(init.method, 'POST')
    return reject
      ? Response.json({}, { status: 400 })
      : Response.json({ data: { requeuedCount: 1 } }, { status: 202 })
  })
  await exchangeLoginCode('fixture')
  const detail = await getPullRequestDetail(99)
  assert.equal(detail.analysis.summary, '요약')
  assert.equal(detail.filesTruncated, true)
  assert.equal((await retryFailedPrs(7, 2)).requeuedCount, 1)
  reject = true
  await assert.rejects(retryFailedPrs(7, 2), PrRetryRejected)
})

test('feature spec states and PDF validation stay frontend-only and deterministic', async (t) => {
  const {
    getFeatureSpecStage,
    validateFeatureSpecFile,
    FEATURE_SPEC_MAX_BYTES,
  } = await modules(t)

  assert.equal(getFeatureSpecStage(null), 'empty')
  assert.equal(
    getFeatureSpecStage({ extractionStatus: 'PENDING' }),
    'extracting',
  )
  assert.equal(
    getFeatureSpecStage({ extractionStatus: 'PROCESSING' }),
    'extracting',
  )
  assert.equal(getFeatureSpecStage({ extractionStatus: 'COMPLETED' }), 'ready')
  assert.equal(getFeatureSpecStage({ extractionStatus: 'FAILED' }), 'failed')
  assert.equal(
    getFeatureSpecStage({ extractionStatus: 'NEW_VALUE' }),
    'unknown',
  )

  assert.equal(
    validateFeatureSpecFile({ name: 'requirements.pdf', size: 1024 }),
    null,
  )
  assert.match(
    validateFeatureSpecFile({ name: 'requirements.txt', size: 1024 }),
    /PDF/,
  )
  assert.match(
    validateFeatureSpecFile({ name: 'requirements.pdf', size: 0 }),
    /비어/,
  )
  assert.match(
    validateFeatureSpecFile({
      name: 'requirements.pdf',
      size: FEATURE_SPEC_MAX_BYTES + 1,
    }),
    /20MB/,
  )
})

test('feature spec upload uses the existing endpoint and never hides an uncertain outcome', async (t) => {
  const {
    exchangeLoginCode,
    uploadFeatureSpec,
    FeatureSpecUploadRejected,
    FeatureSpecUploadUnknown,
  } = await modules(t)
  let outcome = 'accepted'
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname
    if (path === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    requests.push({ path, method: init.method, body: init.body })
    if (outcome === 'network') throw new TypeError('connection dropped')
    if (outcome === 'rejected') return new Response(null, { status: 400 })
    if (outcome === 'unknown') return new Response(null, { status: 500 })
    return new Response(null, { status: 202 })
  })
  await exchangeLoginCode('fixture')
  const file = new File(['pdf'], 'requirements.pdf', {
    type: 'application/pdf',
  })

  await uploadFeatureSpec(7, file)
  assert.equal(requests[0].path, '/projects/7/feature-specs')
  assert.equal(requests[0].method, 'POST')
  assert.ok(requests[0].body instanceof FormData)

  outcome = 'rejected'
  await assert.rejects(uploadFeatureSpec(7, file), FeatureSpecUploadRejected)
  outcome = 'unknown'
  await assert.rejects(uploadFeatureSpec(7, file), FeatureSpecUploadUnknown)
  outcome = 'network'
  await assert.rejects(uploadFeatureSpec(7, file), FeatureSpecUploadUnknown)
})

test('feature review reads server groups, summary counts and exact filters', async (t) => {
  const { exchangeLoginCode, getFeatureReviewList, getFeatureReviewSummary } =
    await modules(t)
  const paths = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(url)
    if (u.pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    paths.push(u.pathname + u.search)
    if (u.pathname.endsWith('/review-summary'))
      return Response.json({
        data: { reviewRequired: 1, noIssue: 1, reviewed: 1, total: 3 },
      })
    return Response.json({
      data: {
        sections: [
          {
            sectionId: 3,
            title: '게시글',
            features: [
              {
                featureId: 12,
                name: '게시글 작성',
                reviewStatus: 'UNREVIEWED',
                sourcePageStart: 3,
                sourcePageEnd: 4,
                requirements: [
                  {
                    requirementId: 34,
                    content: '게시글을 작성한다.',
                    sourceText: '사용자는 게시글을 작성할 수 있다.',
                  },
                ],
                issues: [
                  {
                    issueType: 'DUPLICATE_SUSPECTED',
                    description: '요구사항이 겹칩니다.',
                  },
                ],
                duplicateCandidates: [
                  {
                    targetFeatureId: 19,
                    targetFeatureName: '글쓰기',
                    targetSourcePageStart: 6,
                    targetSourcePageEnd: 7,
                    targetRequirements: [],
                    reason: '동일한 흐름입니다.',
                    suggestedMergedName: '게시글 작성',
                    suggestedSection: '게시글',
                  },
                ],
                splitSuggestions: [],
              },
            ],
          },
        ],
      },
    })
  })
  await exchangeLoginCode('fixture')
  const summary = await getFeatureReviewSummary(9)
  const list = await getFeatureReviewList(9, 'REVIEW_REQUIRED')
  await getFeatureReviewList(9, 'ALL')
  assert.deepEqual(summary, {
    reviewRequired: 1,
    noIssue: 1,
    reviewed: 1,
    total: 3,
  })
  assert.equal(
    list.sections[0].features[0].requirements[0].sourceText,
    '사용자는 게시글을 작성할 수 있다.',
  )
  assert.deepEqual(paths, [
    '/feature-specs/9/review-summary',
    '/feature-specs/9/features?filter=REVIEW_REQUIRED',
    '/feature-specs/9/features',
  ])
})

test('feature review rejects malformed counts and remote feature shapes', async (t) => {
  const { exchangeLoginCode, getFeatureReviewList, getFeatureReviewSummary } =
    await modules(t)
  let malformed = 'summary'
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/auth/token'))
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    return malformed === 'summary'
      ? Response.json({
          data: { reviewRequired: 2, noIssue: 2, reviewed: 2, total: 3 },
        })
      : Response.json({
          data: {
            sections: [
              { sectionId: 1, title: '기능', features: [{ featureId: 1 }] },
            ],
          },
        })
  })
  await exchangeLoginCode('fixture')
  await assert.rejects(getFeatureReviewSummary(9), /응답/)
  malformed = 'list'
  await assert.rejects(getFeatureReviewList(9, 'ALL'), /응답/)
})

test('feature review mutations use the committed contracts and classify uncertain results', async (t) => {
  const {
    confirmAllFeatures,
    confirmFeature,
    deleteFeature,
    exchangeLoginCode,
    mergeFeature,
    splitFeature,
    updateFeature,
    FeatureReviewMutationRejected,
    FeatureReviewMutationUnknown,
  } = await modules(t)
  const calls = []
  let outcome = 200
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname
    if (path === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    calls.push({ path, method: init.method, body: init.body })
    if (outcome === 'network') throw new TypeError('connection dropped')
    return new Response(null, { status: outcome })
  })
  await exchangeLoginCode('fixture')

  await confirmAllFeatures(9)
  await confirmFeature(9, 12)
  await updateFeature(9, 12, {
    name: '게시글 관리',
    requirements: [{ id: 34, content: '게시글을 관리한다.' }],
  })
  await mergeFeature(9, 12, 19, '게시글 작성')
  await splitFeature(9, 12, {
    features: [{ suggestionId: 7, name: '게시글 관리' }],
  })
  await deleteFeature(9, 12)

  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ['/feature-specs/9/features/confirm-all', 'POST'],
      ['/feature-specs/9/features/12/confirm', 'POST'],
      ['/feature-specs/9/features/12', 'PATCH'],
      ['/feature-specs/9/features/12/merge', 'POST'],
      ['/feature-specs/9/features/12/split', 'POST'],
      ['/feature-specs/9/features/12', 'DELETE'],
    ],
  )
  assert.deepEqual(JSON.parse(calls[2].body), {
    name: '게시글 관리',
    requirements: [{ id: 34, content: '게시글을 관리한다.' }],
  })
  assert.deepEqual(JSON.parse(calls[3].body), {
    targetFeatureId: 19,
    name: '게시글 작성',
  })
  assert.deepEqual(JSON.parse(calls[4].body), {
    features: [{ suggestionId: 7, name: '게시글 관리' }],
  })

  outcome = 400
  await assert.rejects(confirmFeature(9, 12), FeatureReviewMutationRejected)
  outcome = 500
  await assert.rejects(confirmFeature(9, 12), FeatureReviewMutationUnknown)
  outcome = 'network'
  await assert.rejects(confirmFeature(9, 12), FeatureReviewMutationUnknown)
})

test('replacement uses PUT multipart and never falls back to POST on rejection', async (t) => {
  const {
    exchangeLoginCode,
    replaceFeatureSpec,
    FeatureSpecUploadRejected,
    FeatureSpecUploadUnknown,
  } = await modules(t)
  let status = 200
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/auth/token'))
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    calls.push(init)
    assert.equal(new URL(url).pathname, '/projects/7/feature-specs')
    return new Response(null, { status })
  })
  await exchangeLoginCode('fixture')
  const file = new File(['pdf'], 'new.pdf', { type: 'application/pdf' })
  await replaceFeatureSpec(7, file)
  for (status of [400, 403, 404, 409, 413, 415, 422])
    await assert.rejects(replaceFeatureSpec(7, file), FeatureSpecUploadRejected)
  for (status of [408, 425, 500, 503])
    await assert.rejects(replaceFeatureSpec(7, file), FeatureSpecUploadUnknown)
  assert.equal(calls.length, 12)
  assert.ok(
    calls.every(
      (call) =>
        call.method === 'PUT' && call.body.get('file').name === 'new.pdf',
    ),
  )
})

test('spec replacement locks across mounts and verifies a different document ID after acceptance', async (t) => {
  const { FeatureSpecUploadStore } = await modules(t)
  const waiting = deferred()
  let document = {
    specDocumentId: 9,
    extractionStatus: 'COMPLETED',
    fileName: 'old.pdf',
  }
  let puts = 0
  const store = new FeatureSpecUploadStore({
    get: async () => ({ ...projectFixture(), specDocument: document }),
    upload: () => assert.fail('replacement must not POST'),
    replace: async () => {
      puts++
      await waiting.promise
    },
  })
  const submit = () => store.request(7, {}, 9, async () => true)
  const pending = submit()
  await tick()
  store.subscribe(() => {})()
  await submit()
  assert.equal(puts, 1)
  waiting.resolve()
  await pending
  await store.check(7)
  await submit()
  assert.equal(puts, 1)
  assert.equal(store.get(7).phase, 'accepted')
  document = { ...document, specDocumentId: 10, extractionStatus: 'PENDING' }
  await store.check(7)
  assert.equal(store.get(7).phase, 'idle')
})

test('uncertain spec request remains blocked after unchanged, missing, or failed reads', async (t) => {
  const { FeatureSpecUploadStore } = await modules(t)
  let document = {
    specDocumentId: 9,
    extractionStatus: 'FAILED',
    fileName: 'old.pdf',
  }
  let offline = false
  let puts = 0
  const store = new FeatureSpecUploadStore({
    get: async () => {
      if (offline) throw Error('offline')
      return { ...projectFixture(), specDocument: document }
    },
    upload: () => assert.fail('no fallback'),
    replace: async () => {
      puts++
      throw Error('timeout')
    },
  })
  const submit = () => store.request(7, {}, 9, async () => true)
  await submit()
  await store.check(7)
  document = null
  await store.check(7)
  offline = true
  await assert.rejects(store.check(7))
  await submit()
  assert.equal(puts, 1)
  assert.equal(store.get(7).phase, 'unknown')
})

test('spec consent cancellation, unmount during preflight and changed document never dispatch', async (t) => {
  const { FeatureSpecUploadStore } = await modules(t)
  let document = { specDocumentId: 10, extractionStatus: 'COMPLETED' }
  const store = new FeatureSpecUploadStore({
    get: async () => ({ ...projectFixture(), specDocument: document }),
    upload: () => assert.fail('no POST'),
    replace: () => assert.fail('no PUT'),
  })
  await store.request(7, {}, 9, async () => false)
  assert.equal(store.get(7).phase, 'idle')
  await store.request(7, {}, 9, async () => true)
  assert.equal(store.get(7).phase, 'rejected')
  document = { specDocumentId: 9, extractionStatus: 'PROCESSING' }
  await store.request(7, {}, 9, async () => true)
  assert.equal(store.get(7).phase, 'rejected')
  await store.request(
    7,
    {},
    9,
    async () => true,
    () => false,
  )
  assert.equal(store.get(7).phase, 'idle')
})

test('explicit spec rejection allows only a new manual intent', async (t) => {
  const { FeatureSpecUploadStore, FeatureSpecUploadRejected } = await modules(t)
  let posts = 0
  const store = new FeatureSpecUploadStore({
    get: async () => ({ ...projectFixture(), specDocument: null }),
    upload: async () => {
      if (++posts === 1) throw new FeatureSpecUploadRejected('invalid PDF')
    },
    replace: () => assert.fail('no PUT'),
  })
  await store.request(7, {}, undefined, async () => true)
  await store.check(7)
  assert.equal(posts, 1)
  assert.equal(store.get(7).phase, 'rejected')
  await store.request(7, {}, undefined, async () => true)
  assert.equal(posts, 2)
  assert.equal(store.get(7).phase, 'accepted')
})

test('review owner survives unsubscribe and locks until both reconciliation reads settle', async (t) => {
  const { getFeatureReviewOwner, exchangeLoginCode } = await modules(t)
  const read = deferred()
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    await read.promise
    return Response.json({
      data: url.endsWith('/features')
        ? { sections: [] }
        : { total: 0, reviewed: 0, noIssue: 0, reviewRequired: 0 },
    })
  })
  await exchangeLoginCode('fixture')
  const owner = getFeatureReviewOwner(9)
  const request = deferred()
  let calls = 0
  const unsubscribe = owner.subscribe(() => {})
  const pending = owner.run(
    '승인 중',
    () => {
      calls++
      return request.promise
    },
    '승인 완료',
  )
  unsubscribe()
  assert.equal(getFeatureReviewOwner(9), owner)
  assert.notEqual(getFeatureReviewOwner(10), owner)
  assert.equal(
    await owner.run(
      '중복',
      () => {
        calls++
      },
      '',
    ),
    false,
  )
  request.resolve()
  await tick()
  assert.equal(owner.getSnapshot().phase, 'checking')
  assert.equal(
    await owner.run(
      '중복',
      () => {
        calls++
      },
      '',
    ),
    false,
  )
  read.resolve()
  await pending
  assert.equal(calls, 1)
  assert.equal(owner.getSnapshot().phase, 'idle')
})

test('review reconciliation failures block writes; GET recovery does not resolve uncertain intent', async (t) => {
  const {
    getFeatureReviewOwner,
    exchangeLoginCode,
    FeatureReviewMutationUnknown,
    FeatureReviewMutationRejected,
  } = await modules(t)
  let fail = true
  let reads = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).pathname === '/auth/token')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    reads++
    if (fail && url.endsWith('/review-summary'))
      return new Response(null, { status: 503 })
    return Response.json({
      data: url.endsWith('/features')
        ? { sections: [] }
        : { total: 0, reviewed: 0, noIssue: 0, reviewRequired: 0 },
    })
  })
  await exchangeLoginCode('fixture')
  for (const unknown of [false, true]) {
    fail = true
    const owner = getFeatureReviewOwner(unknown ? 10 : 9)
    await owner.run(
      '승인 중',
      async () => {
        throw unknown
          ? new FeatureReviewMutationUnknown('불확실')
          : new FeatureReviewMutationRejected('거절')
      },
      '',
    )
    assert.equal(owner.getSnapshot().phase, 'read-error')
    assert.equal(
      await owner.run('', () => assert.fail('must not resend'), ''),
      false,
    )
    fail = false
    await owner.refresh()
    assert.equal(owner.getSnapshot().phase, unknown ? 'uncertain' : 'idle')
    assert.equal(
      owner.getSnapshot().notice.tone,
      unknown ? 'warning' : 'danger',
    )
    if (unknown) {
      await owner.refresh()
      assert.equal(
        await owner.run('', () => assert.fail('must not resend'), ''),
        false,
      )
    }
  }
  assert.equal(reads, 10)
})
