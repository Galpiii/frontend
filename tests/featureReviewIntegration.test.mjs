import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inspectReview,
  runReviewPlan,
} from './integration/featureReviewFlow.mjs'

function fixture() {
  const requirement = (id, content) => ({
    requirementId: id,
    content,
    sourceText: null,
  })
  const feature = (id) => ({
    featureId: id,
    name: `Feature ${id}`,
    reviewStatus: 'UNREVIEWED',
    requirements: [requirement(id * 10, `Requirement ${id}`)],
    issues: [],
    duplicateCandidates: [],
    splitSuggestions: [],
  })
  let features = Array.from({ length: 6 }, (_, i) => feature(i + 1))
  features[0].duplicateCandidates = [{ targetFeatureId: 2 }]
  features[0].issues = [{ issueType: 'DUPLICATE_SUSPECTED' }]
  features[2].splitSuggestions = [
    { suggestionId: 31, requirements: [requirement(30, 'Requirement 3')] },
    { suggestionId: 32, requirements: [] },
  ]
  features[2].issues = [{ issueType: 'SPLIT_RECOMMENDED' }]
  const calls = []
  const clean = (f, status) =>
    Object.assign(f, {
      reviewStatus: status,
      issues: [],
      duplicateCandidates: [],
      splitSuggestions: [],
    })
  const api = async (method, args) => {
    calls.push(method)
    const f = features.find((item) => item.featureId === args[1])
    if (method === 'getFeatureReviewSummary') {
      const reviewRequired = features.filter(
        (f) => f.reviewStatus === 'UNREVIEWED' && f.issues.length,
      ).length
      const noIssue = features.filter(
        (f) => f.reviewStatus === 'UNREVIEWED' && !f.issues.length,
      ).length
      return {
        total: features.length,
        reviewRequired,
        noIssue,
        reviewed: features.length - reviewRequired - noIssue,
      }
    }
    if (method === 'getFeatureReviewList') {
      const filtered = features.filter(
        (f) =>
          args[1] === 'ALL' ||
          (args[1] === 'REVIEWED'
            ? f.reviewStatus !== 'UNREVIEWED'
            : f.reviewStatus === 'UNREVIEWED' &&
              (args[1] === 'REVIEW_REQUIRED'
                ? f.issues.length > 0
                : f.issues.length === 0)),
      )
      return structuredClone({
        sections: [{ sectionId: 1, title: 'Test', features: filtered }],
      })
    }
    if (method === 'confirmFeature') clean(f, 'USER_CONFIRMED')
    if (method === 'confirmAllFeatures')
      features
        .filter((f) => f.reviewStatus === 'UNREVIEWED')
        .forEach((f) => clean(f, 'USER_CONFIRMED'))
    if (method === 'updateFeature') {
      f.name = args[2].name
      f.requirements = args[2].requirements.map((r, i) =>
        requirement(r.id ?? 100 + i, r.content),
      )
      clean(f, 'USER_MODIFIED')
    }
    if (method === 'deleteFeature')
      features = features.filter((item) => item !== f)
    if (method === 'mergeFeature') {
      const target = features.find((item) => item.featureId === args[2])
      const merged = {
        ...feature(7),
        name: args[3],
        requirements: [...f.requirements, ...target.requirements],
      }
      features = features.filter((item) => item !== f && item !== target)
      features.push(clean(merged, 'USER_MODIFIED'))
    }
    if (method === 'splitFeature') {
      features = features.filter((item) => item !== f)
      args[2].features.forEach((requested, i) =>
        features.push(
          clean(
            {
              ...feature(8 + i),
              name: requested.name,
              requirements: f.splitSuggestions.find(
                (s) => s.suggestionId === requested.suggestionId,
              ).requirements,
            },
            'USER_MODIFIED',
          ),
        ),
      )
    }
  }
  return { api, calls }
}
const plan = {
  specDocumentId: 9,
  actions: [
    { kind: 'merge', featureId: 1, targetFeatureId: 2, name: 'Merged' },
    {
      kind: 'split',
      featureId: 3,
      features: [
        { suggestionId: 31, name: 'First' },
        { suggestionId: 32, name: 'Second' },
      ],
    },
    { kind: 'confirm', featureId: 4 },
    {
      kind: 'edit',
      featureId: 5,
      name: 'Edited',
      requirements: [{ content: 'New requirement' }],
    },
    { kind: 'delete', featureId: 6 },
    { kind: 'confirm-all' },
  ],
}

test('live review inspection reads all filters without mutations', async () => {
  const { api, calls } = fixture()
  const result = await inspectReview(api, 9)
  assert.equal(result.summary.total, 6)
  assert.ok(calls.every((method) => method.startsWith('get')))
})

test('live review plan verifies replacement, merge, split and all confirmations', async () => {
  const { api, calls } = fixture()
  const passed = []
  let checks = 0
  await runReviewPlan(
    api,
    plan,
    async (id) => {
      assert.equal(id, 9)
      checks++
    },
    (entry) => passed.push(entry),
  )
  assert.equal(checks, 7)
  assert.equal(passed.length, 6)
  assert.equal(calls.filter((method) => !method.startsWith('get')).length, 6)
})

test('invalid later actions prevent any writes and document changes stop before dispatch', async () => {
  const { api, calls } = fixture()
  await assert.rejects(
    runReviewPlan(
      api,
      {
        ...plan,
        actions: [...plan.actions, { kind: 'delete', featureId: 999 }],
      },
      async () => {},
    ),
  )
  assert.ok(calls.every((method) => method.startsWith('get')))
  let checks = 0
  await assert.rejects(
    runReviewPlan(api, plan, async () => {
      if (++checks === 2) throw new Error('document changed')
    }),
    /document changed/,
  )
  assert.ok(calls.every((method) => method.startsWith('get')))
})

test('uncertain live mutations reconcile with GET and never continue or replay', async () => {
  const { api, calls } = fixture()
  let writes = 0
  await assert.rejects(
    runReviewPlan(
      async (method, args) => {
        if (!method.startsWith('get')) {
          writes++
          throw new Error('network')
        }
        return api(method, args)
      },
      plan,
      async () => {},
    ),
    /Stopped without retrying or continuing/,
  )
  assert.equal(writes, 1)
  assert.deepEqual(calls.slice(-2), [
    'getFeatureReviewSummary',
    'getFeatureReviewList',
  ])
})

test('incorrect full replacement response stops before a subsequent deletion', async () => {
  const { api } = fixture()
  let writes = 0
  await assert.rejects(
    runReviewPlan(
      async (method, args) => {
        if (!method.startsWith('get')) {
          writes++
          return // Simulate an acknowledged write whose GET state did not change.
        }
        return api(method, args)
      },
      { specDocumentId: 9, actions: plan.actions.slice(3, 5) },
      async () => {},
    ),
  )
  assert.equal(writes, 1)
})
