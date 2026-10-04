import assert from 'node:assert/strict'

const flatten = (list) => list.sections.flatMap((section) => section.features)
const contents = (requirements) => requirements.map((r) => r.content).sort()
const requireId = (id) =>
  assert.ok(
    Number.isSafeInteger(id) && id > 0,
    'A positive integer ID is required',
  )

export async function readReview(api, documentId) {
  const [summary, list] = await Promise.all([
    api('getFeatureReviewSummary', [documentId]),
    api('getFeatureReviewList', [documentId, 'ALL']),
  ])
  const features = flatten(list)
  assert.equal(
    new Set(features.map((f) => f.featureId)).size,
    features.length,
    'Duplicate feature IDs',
  )
  assert.equal(
    features.length,
    summary.total,
    'List and summary disagree; stop and inspect concurrent changes',
  )
  return { summary, features }
}

export async function inspectReview(api, documentId) {
  const snapshot = await readReview(api, documentId)
  for (const [filter, predicate, count] of [
    [
      'REVIEW_REQUIRED',
      (f) => f.reviewStatus === 'UNREVIEWED' && f.issues.length > 0,
      snapshot.summary.reviewRequired,
    ],
    [
      'NO_ISSUE',
      (f) => f.reviewStatus === 'UNREVIEWED' && f.issues.length === 0,
      snapshot.summary.noIssue,
    ],
    [
      'REVIEWED',
      (f) => f.reviewStatus !== 'UNREVIEWED',
      snapshot.summary.reviewed,
    ],
  ]) {
    const filtered = flatten(
      await api('getFeatureReviewList', [documentId, filter]),
    )
    assert.equal(filtered.length, count, `Unexpected ${filter} count`)
    assert.deepEqual(
      filtered.map((f) => f.featureId).sort((a, b) => a - b),
      snapshot.features
        .filter(predicate)
        .map((f) => f.featureId)
        .sort((a, b) => a - b),
      `Unexpected ${filter} membership`,
    )
  }
  return snapshot
}

function prepare(action, features, documentId) {
  const feature = features.find((f) => f.featureId === action.featureId)
  if (action.kind === 'confirm-all') return ['confirmAllFeatures', [documentId]]
  requireId(action.featureId)
  assert.ok(feature, 'Selected feature no longer exists')
  const name = (value) =>
    assert.ok(
      typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 255,
      'Invalid feature name',
    )
  switch (action.kind) {
    case 'confirm':
      assert.equal(
        feature.reviewStatus,
        'UNREVIEWED',
        'Choose an unreviewed feature',
      )
      return ['confirmFeature', [documentId, action.featureId]]
    case 'delete':
      return ['deleteFeature', [documentId, action.featureId]]
    case 'edit':
      name(action.name)
      assert.ok(
        Array.isArray(action.requirements) && action.requirements.length <= 100,
        'Complete requirements array is required',
      )
      for (const requirement of action.requirements) {
        assert.ok(
          typeof requirement.content === 'string' &&
            requirement.content.trim().length > 0 &&
            requirement.content.length <= 2000,
          'Invalid requirement content',
        )
        if (requirement.id !== undefined)
          assert.ok(
            feature.requirements.some(
              (r) => r.requirementId === requirement.id,
            ),
            'Requirement ID does not belong to the selected feature',
          )
      }
      return [
        'updateFeature',
        [
          documentId,
          action.featureId,
          { name: action.name, requirements: action.requirements },
        ],
      ]
    case 'merge':
      name(action.name)
      assert.ok(
        feature.duplicateCandidates.some(
          (c) => c.targetFeatureId === action.targetFeatureId,
        ),
        'Merge target must be a server candidate',
      )
      assert.ok(
        features.some((f) => f.featureId === action.targetFeatureId),
        'Merge target is missing',
      )
      return [
        'mergeFeature',
        [documentId, action.featureId, action.targetFeatureId, action.name],
      ]
    case 'split':
      assert.ok(
        feature.splitSuggestions.length > 0,
        'No server split suggestions',
      )
      assert.ok(
        Array.isArray(action.features),
        'All server suggestions must be supplied',
      )
      assert.deepEqual(
        action.features.map((f) => f.suggestionId).sort((a, b) => a - b),
        feature.splitSuggestions
          .map((s) => s.suggestionId)
          .sort((a, b) => a - b),
        'Split must use every server suggestion exactly once',
      )
      action.features.forEach((f) => name(f.name))
      return [
        'splitFeature',
        [documentId, action.featureId, { features: action.features }],
      ]
    default:
      throw new Error('Unsupported review action')
  }
}

function verify(action, before, after) {
  const original = before.features.find((f) => f.featureId === action.featureId)
  const current = after.features.find((f) => f.featureId === action.featureId)
  const created = after.features.filter(
    (f) => !before.features.some((old) => old.featureId === f.featureId),
  )
  const clean = (f, status) => {
    assert.ok(f, 'Expected feature is missing')
    assert.equal(f.reviewStatus, status)
    assert.equal(
      f.issues.length +
        f.duplicateCandidates.length +
        f.splitSuggestions.length,
      0,
      'Review suggestions were not cleared',
    )
  }
  switch (action.kind) {
    case 'confirm':
      clean(current, 'USER_CONFIRMED')
      break
    case 'edit':
      clean(current, 'USER_MODIFIED')
      assert.equal(current.name, action.name)
      assert.deepEqual(
        contents(current.requirements),
        contents(action.requirements),
      )
      for (const old of original.requirements) {
        if (!action.requirements.some((r) => r.id === old.requirementId))
          assert.ok(
            !current.requirements.some(
              (r) => r.requirementId === old.requirementId,
            ),
            'Omitted requirement survived full replacement',
          )
      }
      break
    case 'delete':
      assert.equal(current, undefined)
      assert.equal(after.summary.total, before.summary.total - 1)
      break
    case 'merge': {
      assert.equal(current, undefined)
      assert.ok(
        !after.features.some((f) => f.featureId === action.targetFeatureId),
      )
      assert.equal(created.length, 1)
      clean(created[0], 'USER_MODIFIED')
      assert.equal(created[0].name, action.name)
      const target = before.features.find(
        (f) => f.featureId === action.targetFeatureId,
      )
      assert.deepEqual(
        contents(created[0].requirements),
        contents([...original.requirements, ...target.requirements]),
      )
      assert.equal(after.summary.total, before.summary.total - 1)
      break
    }
    case 'split': {
      assert.equal(current, undefined)
      assert.equal(created.length, action.features.length)
      const remaining = [...created]
      for (const requested of action.features) {
        const suggestion = original.splitSuggestions.find(
          (s) => s.suggestionId === requested.suggestionId,
        )
        const index = remaining.findIndex(
          (f) =>
            f.name === requested.name &&
            JSON.stringify(contents(f.requirements)) ===
              JSON.stringify(contents(suggestion.requirements)),
        )
        assert.ok(index >= 0, 'Expected split feature/requirements are missing')
        clean(remaining.splice(index, 1)[0], 'USER_MODIFIED')
      }
      assert.equal(
        after.summary.total,
        before.summary.total - 1 + action.features.length,
      )
      break
    }
    case 'confirm-all':
      for (const old of before.features) {
        const next = after.features.find((f) => f.featureId === old.featureId)
        if (old.reviewStatus === 'UNREVIEWED') clean(next, 'USER_CONFIRMED')
        else assert.equal(next?.reviewStatus, old.reviewStatus)
      }
      assert.equal(after.summary.reviewRequired + after.summary.noIssue, 0)
  }
}

export async function runReviewPlan(
  api,
  plan,
  checkDocument,
  report = () => {},
) {
  requireId(plan.specDocumentId)
  assert.ok(
    Array.isArray(plan.actions) && plan.actions.length > 0,
    'Explicit actions are required',
  )
  await checkDocument(plan.specDocumentId)
  const initial = await inspectReview(api, plan.specDocumentId)
  // Validate the entire plan before the first write. Distinct targets prevent
  // approval or editing from invalidating later merge/split suggestions.
  const targets = new Set()
  for (const [index, action] of plan.actions.entries()) {
    prepare(action, initial.features, plan.specDocumentId)
    if (action.kind === 'confirm-all')
      assert.equal(
        index,
        plan.actions.length - 1,
        'Bulk confirmation must be last',
      )
    for (const id of [action.featureId, action.targetFeatureId].filter(
      (id) => id !== undefined,
    )) {
      assert.ok(
        !targets.has(id),
        'Use distinct feature targets for each action',
      )
      targets.add(id)
    }
  }
  for (const action of plan.actions) {
    await checkDocument(plan.specDocumentId)
    const before = await readReview(api, plan.specDocumentId)
    const [method, args] = prepare(action, before.features, plan.specDocumentId)
    try {
      await api(method, args)
    } catch {
      // A timed-out mutation can still be running. GET observations never
      // authorize a replay or the next action in this integration run.
      const observed = await readReview(api, plan.specDocumentId).then(
        () => 'readable',
        () => 'unavailable',
      )
      throw new Error(
        `${action.kind}: mutation did not complete normally; GET ${observed}. Stopped without retrying or continuing.`,
      )
    }
    const after = await readReview(api, plan.specDocumentId)
    verify(action, before, after)
    report({ action: action.kind, status: 'passed' })
  }
}
