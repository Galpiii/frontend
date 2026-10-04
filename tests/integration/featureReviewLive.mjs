import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import { inspectReview, runReviewPlan } from './featureReviewFlow.mjs'

if (process.argv.includes('--help')) {
  console.log(
    'Read: REVIEW_PROJECT_ID=<id> PLAYWRIGHT_STORAGE_STATE=<dedicated session file> node tests/integration/featureReviewLive.mjs\nWrite: add REVIEW_PLAN_PATH=<plan.json> and --apply. Start Vite first. The session file is updated after token rotation; never share it with an active browser or concurrent run.',
  )
  process.exit(0)
}

const projectId = Number(process.env.REVIEW_PROJECT_ID)
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE
const apply = process.argv.includes('--apply')
if (!Number.isSafeInteger(projectId) || projectId <= 0 || !storageState) {
  throw new Error(
    'Set REVIEW_PROJECT_ID and PLAYWRIGHT_STORAGE_STATE (authenticated test-session file). Default mode reads only; --apply also requires REVIEW_PLAN_PATH.',
  )
}
const plan = apply
  ? JSON.parse(await readFile(process.env.REVIEW_PLAN_PATH, 'utf8'))
  : null
if (plan && plan.projectId !== projectId)
  throw new Error('Plan projectId does not match REVIEW_PROJECT_ID')
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core'
)
const lockPath = `${storageState}.lock`
const lock = await open(lockPath, 'wx', 0o600)
let browser
let context
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })
  context = await browser.newContext({ storageState })
  const page = await context.newPage()
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173'
  // A neutral page avoids mounting the app and dispatching unrelated UI work.
  // Modules come from Vite so the real validators, auth and API origin are used.
  await page.goto(`${origin}/tests/integration/featureReview.html`)
  const api = async (method, args) => {
    const result = await page.evaluate(
      async ({ method, args }) => {
        try {
          const module = await import('/src/lib/featureReviewApi.ts')
          return { ok: true, value: await module[method](...args) }
        } catch (error) {
          return { ok: false, type: error.constructor.name }
        }
      },
      { method, args },
    )
    if (!result.ok)
      throw new Error(
        `Review API failed (${result.type}); credentials and response bodies are not logged`,
      )
    return result.value
  }
  const checkDocument = async (expected) => {
    const result = await page.evaluate(async (projectId) => {
      try {
        const { getProjectDetail } = await import('/src/lib/projectApi.ts')
        const project = await getProjectDetail(projectId)
        return { document: project.specDocument }
      } catch (error) {
        return {
          error: error.constructor.name,
          status: Number.isInteger(error.status) ? error.status : null,
        }
      }
    }, projectId)
    if (result.error)
      throw new Error(
        `Project lookup failed (${result.error}, status ${result.status ?? 'unavailable'}); no review mutation sent`,
      )
    if (result.document?.extractionStatus !== 'COMPLETED')
      throw new Error(
        'Authenticated project with completed extraction is required',
      )
    if (expected !== undefined && result.document.specDocumentId !== expected)
      throw new Error('Specification changed; no mutation sent')
    return result.document.specDocumentId
  }
  const documentId = await checkDocument(plan?.specDocumentId)
  if (apply) {
    await runReviewPlan(api, plan, checkDocument, (entry) =>
      console.log(JSON.stringify(entry)),
    )
  } else {
    const snapshot = await inspectReview(api, documentId)
    console.log(
      JSON.stringify(
        {
          projectId,
          specDocumentId: documentId,
          summary: snapshot.summary,
          features: snapshot.features.map((f) => ({
            featureId: f.featureId,
            reviewStatus: f.reviewStatus,
            requirementIds: f.requirements.map((r) => r.requirementId),
            mergeTargetIds: f.duplicateCandidates.map((c) => c.targetFeatureId),
            splitSuggestionIds: f.splitSuggestions.map((s) => s.suggestionId),
          })),
        },
        null,
        2,
      ),
    )
  }
} finally {
  try {
    if (context) {
      // Refresh tokens rotate. Persist the new cookie without printing it or
      // losing it when a later assertion fails.
      const temporary = `${storageState}.${process.pid}.tmp`
      await writeFile(temporary, JSON.stringify(await context.storageState()), {
        mode: 0o600,
        flag: 'wx',
      })
      await rename(temporary, storageState)
    }
  } finally {
    try {
      await browser?.close()
    } finally {
      await lock.close()
      await unlink(lockPath)
    }
  }
}
