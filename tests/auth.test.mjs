import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

async function modules(t) {
  const dir = await mkdtemp(join(tmpdir(), 'galpi-auth-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const file of [
    'lib/api',
    'auth/session',
    'auth/bootstrap',
    'lib/consentApi',
    'lib/projectApi',
    'pages/onboardingSteps',
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
  return {
    ...(await import(pathToFileURL(join(dir, 'auth/bootstrap.mjs')))),
    ...(await import(pathToFileURL(join(dir, 'auth/session.mjs')))),
    ...(await import(pathToFileURL(join(dir, 'lib/projectApi.mjs')))),
    ...(await import(pathToFileURL(join(dir, 'pages/onboardingSteps.mjs')))),
  }
}

const tokenBody = {
  data: {
    accessToken: 'test-access-token',
    tokenType: 'Bearer',
    expiresIn: 3600,
  },
}

test('callback code is decoded and scrubbed before exchange; returnTo is not followed', async (t) => {
  const { consumeCallback } = await modules(t)
  let replaced
  const input = consumeCallback(
    {
      href: 'https://frontend.example.test/callback?code=a%2Bb&returnTo=https://evil.example&state=s&keep=1',
    },
    {
      state: null,
      replaceState: (_s, _t, url) => {
        replaced = url
      },
    },
  )
  assert.deepEqual(input, { code: 'a+b', failed: false })
  assert.equal(replaced, '/callback?keep=1')
})

test('exchange sends credentials and stores bearer only for authenticated API calls', async (t) => {
  const { initializeSession, authenticatedFetch } = await modules(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    return Response.json(tokenBody)
  })
  const session = initializeSession({ code: 'one-time-code', failed: false })
  const results = await Promise.all([session, session])
  assert.ok(results.every((result) => result.authenticated))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://backend.example.test/auth/token')
  assert.equal(requests[0].init.credentials, 'include')
  assert.deepEqual(JSON.parse(requests[0].init.body), { code: 'one-time-code' })
  await authenticatedFetch('/projects', { method: 'POST' })
  assert.equal(
    requests[1].init.headers.get('Authorization'),
    'Bearer test-access-token',
  )
})

test('rejected code is not retried or replaced by an unrelated refresh session', async (t) => {
  const { initializeSession } = await modules(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response('', { status: 401 })
  })
  const result = await initializeSession({ code: 'expired', failed: false })
  assert.equal(result.authenticated, false)
  assert.ok(result.error)
  assert.equal(calls, 1)
})

test('refresh is deduplicated and includes the required CSRF header', async (t) => {
  const { restoreSession } = await modules(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    return Response.json(tokenBody)
  })
  await Promise.all([restoreSession(), restoreSession()])
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://backend.example.test/auth/refresh')
  assert.equal(requests[0].init.headers['X-Galpi-Request'], 'true')
  assert.equal(requests[0].init.credentials, 'include')
})

test('empty, duplicate and denied callback codes never reach the exchange API', async (t) => {
  const { consumeCallback, initializeSession } = await modules(t)
  t.mock.method(globalThis, 'fetch', () => {
    assert.fail('must not fetch')
  })
  for (const query of ['code=', 'code=a&code=b', 'code=a&error=denied']) {
    const input = consumeCallback(
      { href: `https://frontend.example.test/?${query}` },
      { state: null, replaceState() {} },
    )
    assert.equal((await initializeSession(input)).authenticated, false)
  }
})

test('no refresh cookie returns the normal logged-out screen', async (t) => {
  const { initializeSession } = await modules(t)
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 401 }),
  )
  assert.deepEqual(await initializeSession({ code: null, failed: false }), {
    authenticated: false,
  })
})

test('malformed token response does not authenticate', async (t) => {
  const { initializeSession } = await modules(t)
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      data: { accessToken: '', tokenType: 'Bearer', expiresIn: 3600 },
    }),
  )
  assert.equal(
    (await initializeSession({ code: 'fixture-code', failed: false }))
      .authenticated,
    false,
  )
})

test('a project mutation returning 401 is not automatically replayed', async (t) => {
  const { initializeSession, authenticatedFetch, SessionError } =
    await modules(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return calls === 1
      ? Response.json(tokenBody)
      : new Response('', { status: 401 })
  })
  await initializeSession({ code: 'fixture-code', failed: false })
  await assert.rejects(
    authenticatedFetch('/projects', { method: 'POST' }),
    SessionError,
  )
  assert.equal(calls, 2)
})

test('every authenticated request is bounded by a timeout and still honors caller aborts', async (t) => {
  const { initializeSession, authenticatedFetch } = await modules(t)
  const signals = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    signals.push(init.signal)
    return Response.json(tokenBody)
  })
  await initializeSession({ code: 'fixture-code', failed: false })
  const controller = new AbortController()
  await authenticatedFetch('/projects', { signal: controller.signal })
  assert.equal(signals.length, 2)
  assert.ok(signals.every((signal) => signal instanceof AbortSignal))
  const [tokenSignal, requestSignal] = signals
  assert.equal(tokenSignal.aborted, false)
  assert.notEqual(requestSignal, controller.signal)
  controller.abort()
  assert.equal(requestSignal.aborted, true)
})

test('an expired session notifies subscribers, but a logged-out first visit does not', async (t) => {
  const {
    initializeSession,
    authenticatedFetch,
    onUnauthorized,
    SessionError,
  } = await modules(t)
  let expiries = 0
  const unsubscribe = onUnauthorized(() => {
    expiries++
  })
  const responses = [
    new Response('', { status: 401 }), // first visit: no refresh cookie yet
    Response.json(tokenBody), // login exchange
    new Response('', { status: 401 }), // the established session is rejected
  ]
  t.mock.method(globalThis, 'fetch', async () => responses.shift())

  assert.equal(
    (await initializeSession({ code: null, failed: false })).authenticated,
    false,
  )
  assert.equal(expiries, 0)

  await initializeSession({ code: 'fixture-code', failed: false })
  await assert.rejects(authenticatedFetch('/projects'), SessionError)
  assert.equal(expiries, 1)

  // A refresh rejected mid-session counts once, and unsubscribing stops it.
  unsubscribe()
  responses.push(new Response('', { status: 401 }))
  await assert.rejects(authenticatedFetch('/projects'), SessionError)
  assert.equal(expiries, 1)
})

test('installation callbacks restore only the matching internal repository route', async (t) => {
  const { consumeCallback, initializeSession } = await modules(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return Response.json(tokenBody)
  })
  for (const installation of ['verified', 'unverified']) {
    let replaced
    const input = consumeCallback(
      {
        href: `https://frontend.example.test/auth/callback?installation=${installation}&returnTo=%2Fprojects%2F12%2Frepositories`,
      },
      {
        state: null,
        replaceState: (_s, _t, url) => {
          replaced = url
        },
      },
    )
    assert.equal(
      replaced,
      `/projects/12/repositories?installation=${installation}`,
    )
    assert.deepEqual(input, { code: null, failed: false })
    assert.equal((await initializeSession(input)).authenticated, true)
  }
  assert.ok(requests.every((url) => url.endsWith('/auth/refresh')))
})

test('installation callbacks reject external, malformed and ambiguous destinations', async (t) => {
  const { consumeCallback } = await modules(t)
  for (const destination of [
    'https://evil.example/projects/12/repositories',
    '//evil.example/projects/12/repositories',
    '/projects/../repositories',
    '/projects/0/repositories',
    '/projects/12/repositories?redirect=https://evil.example',
    '/projects/12/repositories#fragment',
    '/projects/12/repositories\\evil',
  ]) {
    let replaced
    consumeCallback(
      {
        href: `https://frontend.example.test/auth/callback?installation=verified&returnTo=${encodeURIComponent(destination)}`,
      },
      {
        state: null,
        replaceState: (_s, _t, url) => {
          replaced = url
        },
      },
    )
    assert.equal(replaced, undefined, destination)
  }
  let replaced
  consumeCallback(
    {
      href: 'https://frontend.example.test/auth/callback?installation=verified&returnTo=/projects/12/repositories&returnTo=/projects/13/repositories',
    },
    {
      state: null,
      replaceState: (_s, _t, url) => {
        replaced = url
      },
    },
  )
  assert.equal(replaced, undefined)
})

test('analysis requests report skipped repositories and never replay failures', async (t) => {
  const { initializeSession, startProjectAnalysis, analysisStartedMessage } =
    await modules(t)
  const requests = []
  const responses = [
    Response.json(tokenBody),
    Response.json(
      { data: { inaccessibleRepositoryCount: 2 } },
      { status: 202 },
    ),
    new Response('', { status: 503 }),
    Response.json({ data: {} }, { status: 202 }),
  ]
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    return responses.shift()
  })
  await initializeSession({ code: 'fixture-code', failed: false })
  const run = await startProjectAnalysis(12)
  assert.equal(run.inaccessibleRepositoryCount, 2)
  assert.match(analysisStartedMessage(run.inaccessibleRepositoryCount), /2개/)
  assert.equal(
    requests[1].url,
    'https://backend.example.test/projects/12/analyses',
  )
  assert.equal(requests[1].init.method, 'POST')
  await assert.rejects(startProjectAnalysis(12), /Analysis outcome unknown/)
  await assert.rejects(
    startProjectAnalysis(12),
    /분석 응답을 확인할 수 없습니다/,
  )
  assert.equal(requests.length, 4)
})

test('project detail resumes the saved onboarding stage without creating a project', async (t) => {
  const { initializeSession, getProjectDetail, resumeOnboardingStep } =
    await modules(t)
  const requests = []
  const draft = {
    id: 12,
    name: 'saved project',
    status: 'DRAFT',
    onboardingStep: 'SPEC',
    repositories: [],
    specDocument: null,
  }
  let detail = draft
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    return url.endsWith('/auth/token')
      ? Response.json(tokenBody)
      : Response.json({ data: detail })
  })
  await initializeSession({ code: 'fixture-code', failed: false })
  const specProject = await getProjectDetail(12)
  assert.equal(specProject.name, 'saved project')
  assert.equal(resumeOnboardingStep(specProject), 'SPEC')

  detail = { ...draft, onboardingStep: 'REPOSITORIES' }
  assert.equal(resumeOnboardingStep(await getProjectDetail(12)), 'REPOSITORIES')

  // A completed upload wins even if an older step value is returned.
  detail = { ...draft, specDocument: { fileName: 'features.pdf' } }
  assert.equal(resumeOnboardingStep(await getProjectDetail(12)), 'REPOSITORIES')

  detail = {
    ...draft,
    status: 'ACTIVE',
    onboardingStep: 'ANALYSIS',
    repositories: [{ repositoryId: 9, fullName: 'owner/repo' }],
  }
  assert.equal(resumeOnboardingStep(await getProjectDetail(12)), null)
  assert.equal(resumeOnboardingStep({ ...detail, status: 'DRAFT' }), null)
  assert.equal(resumeOnboardingStep({ ...draft, status: 'ARCHIVED' }), null)
  assert.equal(resumeOnboardingStep({ ...draft, onboardingStep: 'DONE' }), null)
  assert.ok(
    requests
      .slice(1)
      .every(({ url, init }) => url.endsWith('/projects/12') && !init.method),
  )
})

test('skipping a spec persists the repository stage and reports save failures', async (t) => {
  const { initializeSession, skipProjectSpec } = await modules(t)
  const requests = []
  const responses = [
    Response.json(tokenBody),
    Response.json({ data: {} }),
    new Response('', { status: 503 }),
  ]
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    return responses.shift()
  })
  await initializeSession({ code: 'fixture-code', failed: false })
  await skipProjectSpec(12)
  assert.equal(requests[1].url, 'https://backend.example.test/projects/12')
  assert.equal(requests[1].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    onboardingStep: 'REPOSITORIES',
  })
  await assert.rejects(skipProjectSpec(12), /진행 단계를 저장하지 못했습니다/)
  assert.equal(requests.length, 3)
})

test('missing or malformed project detail cannot open an onboarding form', async (t) => {
  const { initializeSession, getProjectDetail } = await modules(t)
  const responses = [
    Response.json(tokenBody),
    new Response('', { status: 404 }),
    Response.json({ data: { id: 12, name: 'incomplete' } }),
  ]
  t.mock.method(globalThis, 'fetch', async () => responses.shift())
  await initializeSession({ code: 'fixture-code', failed: false })
  await assert.rejects(getProjectDetail(12), /프로젝트를 찾을 수 없습니다/)
  await assert.rejects(
    getProjectDetail(12),
    /프로젝트 응답을 확인할 수 없습니다/,
  )
})

test('explicit session verification rejects a deleted refresh cookie despite a valid access token', async (t) => {
  const {
    exchangeLoginCode,
    authenticatedFetch,
    onUnauthorized,
    SessionError,
  } = await modules(t)
  const calls = []
  let expired = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(new URL(url).pathname)
    if (url.endsWith('/auth/token')) return Response.json(tokenBody)
    if (url.endsWith('/auth/refresh'))
      return new Response(null, { status: 401 })
    assert.fail('Project must not be created')
  })
  await exchangeLoginCode('fixture')
  const unsubscribe = onUnauthorized(() => expired++)
  t.after(unsubscribe)
  await assert.rejects(
    authenticatedFetch(
      '/projects',
      { method: 'POST' },
      { verifySession: true },
    ),
    SessionError,
  )
  assert.deepEqual(calls, ['/auth/token', '/auth/refresh'])
  assert.equal(expired, 1)
})

test('explicit session verification refreshes before sending a mutation exactly once', async (t) => {
  const { exchangeLoginCode, authenticatedFetch } = await modules(t)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(new URL(url).pathname)
    if (url.endsWith('/auth/token')) return Response.json(tokenBody)
    if (url.endsWith('/auth/refresh'))
      return Response.json({
        data: { ...tokenBody.data, accessToken: 'new-token' },
      })
    assert.equal(init.headers.get('Authorization'), 'Bearer new-token')
    return Response.json({ data: { id: 1 } })
  })
  await exchangeLoginCode('fixture')
  await authenticatedFetch(
    '/projects',
    { method: 'POST' },
    { verifySession: true },
  )
  assert.deepEqual(calls, ['/auth/token', '/auth/refresh', '/projects'])
})
