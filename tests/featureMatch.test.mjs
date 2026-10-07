import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadSources } from './helpers/sources.mjs'

async function api(t, handler) {
  const load = await loadSources(t, [
    'lib/api',
    'features/auth/session',
    'features/consent/api',
    'features/projects/api',
    'features/feature-match/api',
    'features/feature-match/matchOwner',
  ])
  const previousFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previousFetch
  })
  globalThis.fetch = async (input, init) => {
    const url = new URL(input, 'https://frontend.example.test')
    const path = url.pathname + url.search
    if (path === '/auth/refresh')
      return Response.json({
        data: { accessToken: 'fixture', tokenType: 'Bearer', expiresIn: 3600 },
      })
    return handler(path, init)
  }
  return load('features/feature-match/api', 'features/feature-match/matchOwner')
}

const run = {
  featureMatchRunId: 7,
  status: 'RUNNING',
  specDocumentId: 3,
  featureCount: 2,
  totalTargetCount: 3,
  pendingCount: 1,
  runningCount: 1,
  completedCount: 1,
  failedCount: 0,
  cancelledCount: 0,
  progressPercent: 33,
  failureCode: null,
}
const error = (status, code) => Response.json({ code }, { status })

test('latest run distinguishes an absent run from an unimplemented or malformed endpoint', async (t) => {
  let reply = error(404, 'FEATURE-MATCH-001')
  const match = await api(t, () => reply)
  assert.equal(await match.getLatestMatchRun(4), null)
  reply = error(404, 'PROJECT-001')
  await assert.rejects(
    match.getLatestMatchRun(4),
    (e) => e.status === 404 && e.code === 'PROJECT-001',
  )
  reply = Response.json({ data: { ...run, progressPercent: '33' } })
  await assert.rejects(match.getLatestMatchRun(4), /응답 형식/)
  reply = Response.json({ data: { ...run, specDocumentId: undefined } })
  await assert.rejects(match.getLatestMatchRun(4), /응답 형식/)
  reply = Response.json({ data: run })
  assert.deepEqual(await match.getLatestMatchRun(4), run)
})

test('match results use exact filters and reject a feature missing match fields', async (t) => {
  const requests = []
  let feature = {
    featureId: 11,
    name: 'Login',
    reviewStatus: 'UNREVIEWED',
    evidenceStatus: 'NO_EVIDENCE',
    requirementCount: 3,
    relatedPullRequestCount: 0,
    sourcePageStart: null,
    sourcePageEnd: null,
  }
  const summary = Object.fromEntries(
    [
      'totalFeatureCount',
      'evidenceFoundFeatureCount',
      'attentionRequiredFeatureCount',
      'noEvidenceFeatureCount',
      'unreviewedFeatureCount',
      'eligiblePullRequestCount',
      'matchedPullRequestCount',
      'unmatchedPullRequestCount',
      'matchingFailedPullRequestCount',
      'matchingCancelledPullRequestCount',
    ].map((key) => [key, 0]),
  )
  const match = await api(t, (path) => {
    requests.push(path)
    return Response.json({
      data: {
        featureMatchRunId: 7,
        status: 'COMPLETED',
        summary,
        sections: [
          { sectionId: 2, title: 'Authentication', features: [feature] },
        ],
      },
    })
  })
  assert.equal(
    (await match.getMatchResults(4, 'ATTENTION_REQUIRED', 9, '로그인'))
      .sections[0].features[0].requirementCount,
    3,
  )
  assert.match(requests[0], /filter=ATTENTION_REQUIRED/)
  assert.match(requests[0], /repositoryId=9/)
  assert.match(requests[0], /q=%EB%A1%9C%EA%B7%B8%EC%9D%B8/)
  feature = { featureId: 11, name: 'Login' }
  await assert.rejects(match.getMatchResults(4, 'ALL'), /응답 형식/)
})

test('manual connections send multiple selected PRs once and validate the returned set', async (t) => {
  const requests = []
  let response = Response.json({
    data: {
      createdMatches: [
        { matchId: 21, featureId: 11, pullRequestId: 42, source: 'USER' },
        { matchId: 22, featureId: 11, pullRequestId: 43, source: 'USER' },
      ],
    },
  })
  const match = await api(t, (path, init) => {
    requests.push({ path, method: init.method, body: JSON.parse(init.body) })
    return response
  })
  assert.equal(
    (await match.connectPullRequest(11, [42, 43])).createdMatches.length,
    2,
  )
  assert.deepEqual(requests[0], {
    path: '/features/11/pull-request-matches',
    method: 'POST',
    body: { pullRequestIds: [42, 43] },
  })
  await assert.rejects(match.connectPullRequest(11, [42, 42]), /1개 이상/)
  assert.equal(requests.length, 1)
  response = Response.json({
    data: {
      createdMatches: [
        { matchId: 21, featureId: 11, pullRequestId: 42, source: 'USER' },
        { matchId: 22, featureId: 11, pullRequestId: 42, source: 'USER' },
      ],
    },
  })
  await assert.rejects(
    match.connectPullRequest(11, [42, 43]),
    match.MatchOutcomeUnknown,
  )
  assert.equal(requests.length, 2)
})

test('an uncertain start is sent once and a valid receipt keeps the server run ID', async (t) => {
  let writes = 0
  let throwNetwork = true
  const match = await api(t, (path, init) => {
    if (path !== '/projects/4/feature-match-runs' || init.method !== 'POST')
      throw new Error('unexpected endpoint')
    writes++
    if (throwNetwork) throw new Error('connection lost')
    return Response.json({
      data: {
        featureMatchRunId: 7,
        status: 'QUEUED',
        specDocumentId: 3,
        unreviewedFeatureCount: 1,
      },
    })
  })
  await assert.rejects(match.startMatchRun(4), match.MatchOutcomeUnknown)
  assert.equal(writes, 1)
  throwNetwork = false
  assert.equal((await match.startMatchRun(4)).featureMatchRunId, 7)
  assert.equal(writes, 2)
})

test('an ambiguous start stays locked until a distinct server run appears', async (t) => {
  let latest = null
  let writes = 0
  const match = await api(t, (path, init) => {
    if (path === '/projects/4/feature-match-runs/latest')
      return latest
        ? Response.json({ data: latest })
        : error(404, 'FEATURE-MATCH-001')
    if (path === '/projects/4')
      return Response.json({
        data: {
          id: 4,
          name: 'Galpi',
          status: 'ACTIVE',
          onboardingStep: 'COMPLETED',
          lastAnalysis: null,
          repositories: [],
          specDocument: {
            specDocumentId: 3,
            fileName: 'spec.pdf',
            extractionStatus: 'COMPLETED',
          },
        },
      })
    if (path === '/projects/4/feature-match-runs' && init.method === 'POST') {
      writes++
      throw new Error('response lost')
    }
    throw new Error(`unexpected endpoint ${path}`)
  })
  const owner = match.getMatchOwner(4)
  await owner.refresh()
  assert.equal(owner.getSnapshot().phase, 'idle')
  await owner.start(3)
  assert.equal(owner.getSnapshot().phase, 'unknown')
  await owner.start(3)
  assert.equal(writes, 1)
  latest = { ...run, featureMatchRunId: 8 }
  await owner.refresh()
  assert.equal(owner.getSnapshot().phase, 'running')
})

test('a rejected start keeps its reason after the follow-up status read', async (t) => {
  let posts = 0
  const match = await api(t, (path, init) => {
    if (path === '/projects/4/feature-match-runs/latest')
      return error(404, 'FEATURE-MATCH-001')
    if (path === '/projects/4')
      return Response.json({
        data: {
          id: 4,
          name: 'Galpi',
          status: 'ACTIVE',
          onboardingStep: 'COMPLETED',
          lastAnalysis: null,
          repositories: [],
          specDocument: {
            specDocumentId: 3,
            fileName: 'spec.pdf',
            extractionStatus: 'COMPLETED',
          },
        },
      })
    if (path === '/projects/4/feature-match-runs' && init.method === 'POST') {
      posts++
      return error(403, 'CONSENT-001')
    }
    throw new Error(`unexpected endpoint ${path}`)
  })
  const owner = match.getMatchOwner(4)
  await owner.refresh()
  await owner.start(3)
  assert.equal(posts, 1)
  assert.equal(owner.getSnapshot().phase, 'idle')
  assert.match(owner.getSnapshot().startError, /동의/)
  await owner.refresh()
  assert.match(owner.getSnapshot().startError, /동의/)
  await owner.start(3)
  assert.equal(posts, 2)
})

test('PR related features are found in the details of features with evidence in its repository', async (t) => {
  const requests = []
  const summary = Object.fromEntries(
    [
      'totalFeatureCount',
      'evidenceFoundFeatureCount',
      'attentionRequiredFeatureCount',
      'noEvidenceFeatureCount',
      'unreviewedFeatureCount',
      'eligiblePullRequestCount',
      'matchedPullRequestCount',
      'unmatchedPullRequestCount',
      'matchingFailedPullRequestCount',
      'matchingCancelledPullRequestCount',
    ].map((key) => [key, 0]),
  )
  const feature = (featureId, name, relatedPullRequestCount) => ({
    featureId,
    name,
    reviewStatus: 'USER_CONFIRMED',
    evidenceStatus: relatedPullRequestCount ? 'EVIDENCE_FOUND' : 'NO_EVIDENCE',
    relatedPullRequestCount,
    sourcePageStart: null,
    sourcePageEnd: null,
  })
  const detail = (featureId, name, pullRequestId, source) => ({
    featureMatchRunId: 7,
    featureId,
    name,
    reviewStatus: 'USER_CONFIRMED',
    evidenceStatus: 'EVIDENCE_FOUND',
    relatedPullRequestCount: 1,
    requirements: [],
    repositories: [
      {
        repositoryId: 9,
        fullName: 'galpi/web',
        pullRequests: [
          {
            matchId: featureId * 10,
            source,
            reason: `${name} 근거`,
            matchedRequirements: [],
            pullRequest: {
              pullRequestId,
              number: pullRequestId,
              title: 'PR',
              htmlUrl: 'https://github.com/galpi/web/pull/1',
              analysisSummary: null,
              dataCompleteness: 'COMPLETE',
            },
          },
        ],
      },
    ],
  })
  let latest = Response.json({ data: { ...run, status: 'COMPLETED' } })
  const match = await api(t, (path) => {
    requests.push(path)
    if (path.endsWith('/feature-match-runs/latest')) return latest.clone()
    if (path.startsWith('/projects/4/feature-match-results'))
      return Response.json({
        data: {
          featureMatchRunId: 7,
          status: 'COMPLETED',
          summary,
          sections: [
            {
              sectionId: 2,
              title: '인증',
              features: [
                feature(11, '로그인', 1),
                feature(12, '회원가입', 1),
                feature(13, '탈퇴', 0),
              ],
            },
          ],
        },
      })
    if (path.startsWith('/features/11/'))
      return Response.json({ data: detail(11, '로그인', 31, 'USER') })
    if (path.startsWith('/features/12/'))
      return Response.json({ data: detail(12, '회원가입', 32, 'AI') })
    throw new Error(`unexpected ${path}`)
  })
  assert.deepEqual(await match.getPullRequestFeatures(4, 31, 9), {
    state: 'READY',
    features: [
      {
        featureId: 11,
        name: '로그인',
        sectionTitle: '인증',
        source: 'USER',
        reason: '로그인 근거',
      },
    ],
  })
  assert.match(requests[1], /filter=EVIDENCE_FOUND/)
  assert.match(requests[1], /repositoryId=9/)
  assert.ok(requests.every((path) => !path.startsWith('/features/13/')))
  assert.ok(
    requests
      .filter((path) => path.startsWith('/features/'))
      .every((path) => path.endsWith('?repositoryId=9')),
  )
  latest = Response.json({ data: run })
  assert.deepEqual(await match.getPullRequestFeatures(4, 31, 9), {
    state: 'IN_PROGRESS',
  })
  latest = error(404, 'FEATURE-MATCH-001')
  assert.deepEqual(await match.getPullRequestFeatures(4, 31, 9), {
    state: 'NO_RUN',
  })
})
