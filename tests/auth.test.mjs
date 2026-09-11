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
  for (const file of ['lib/api', 'auth/session', 'auth/bootstrap']) {
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
