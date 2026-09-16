import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

async function load(t) {
  const dir = await mkdtemp(join(tmpdir(), 'galpi-filters-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const source = await readFile(
    new URL('../src/pages/repositoryFilters.ts', import.meta.url),
    'utf8',
  )
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
    },
  })
  const file = join(dir, 'repositoryFilters.mjs')
  await writeFile(file, outputText)
  return import(pathToFileURL(file).href)
}

function repo(fullName, extra = {}) {
  const [accountLogin, name] = fullName.split('/')
  return {
    githubRepositoryId: fullName.length + (extra.id ?? 0),
    owner: accountLogin,
    name,
    fullName,
    private: false,
    linked: false,
    accountLogin,
    organization: false,
    ...extra,
  }
}

const everything = {
  owner: 'all',
  visibility: 'all',
  keyword: '',
  sort: 'recent',
}

test('a repository without a usable timestamp sorts last in both directions', async (t) => {
  const { filterRepositories } = await load(t)
  const rows = [
    repo('me/no-date'),
    repo('me/old', { pushedAt: '2024-01-01T00:00:00Z' }),
    repo('me/new', { pushedAt: '2026-01-01T00:00:00Z' }),
    repo('me/unparseable', { pushedAt: 'not a date' }),
  ]

  const recent = filterRepositories(rows, everything).map((r) => r.name)
  const oldest = filterRepositories(rows, {
    ...everything,
    sort: 'oldest',
  }).map((r) => r.name)

  assert.deepEqual(recent.slice(0, 2), ['new', 'old'])
  assert.deepEqual(oldest.slice(0, 2), ['old', 'new'])
  // Undated rows never lead, whichever way the dated ones are ordered.
  assert.deepEqual(recent.slice(2).sort(), ['no-date', 'unparseable'])
  assert.deepEqual(oldest.slice(2).sort(), ['no-date', 'unparseable'])
})

test('sorting does not mutate the caller list', async (t) => {
  const { filterRepositories } = await load(t)
  const rows = [
    repo('me/b', { pushedAt: '2024-01-01T00:00:00Z' }),
    repo('me/a', { pushedAt: '2026-01-01T00:00:00Z' }),
  ]
  const before = rows.map((r) => r.name)
  filterRepositories(rows, { ...everything, sort: 'name' })
  assert.deepEqual(
    rows.map((r) => r.name),
    before,
  )
})

test('personal and organization owners are filtered apart', async (t) => {
  const { filterRepositories, OWNER_PERSONAL, OWNER_ORGANIZATIONS } =
    await load(t)
  const rows = [
    repo('me/mine'),
    repo('acme/one', { organization: true }),
    repo('acme/two', { organization: true }),
  ]

  assert.deepEqual(
    filterRepositories(rows, { ...everything, owner: OWNER_PERSONAL }).map(
      (r) => r.fullName,
    ),
    ['me/mine'],
  )
  assert.equal(
    filterRepositories(rows, { ...everything, owner: OWNER_ORGANIZATIONS })
      .length,
    2,
  )
  assert.deepEqual(
    filterRepositories(rows, { ...everything, owner: 'acme' }).map(
      (r) => r.fullName,
    ),
    ['acme/one', 'acme/two'],
  )
})

test('visibility and keyword narrow the list together', async (t) => {
  const { filterRepositories } = await load(t)
  const rows = [
    repo('me/public-api', { description: 'REST 서버' }),
    repo('me/secret-api', { private: true, description: 'REST 서버' }),
    repo('me/website', { private: true, description: '홍보 페이지' }),
    // GitHub sends null, not an absent field, for a repository with no blurb.
    repo('me/no-blurb', { description: null, language: null }),
  ]

  assert.deepEqual(
    filterRepositories(rows, {
      ...everything,
      visibility: 'private',
      keyword: 'rest',
    }).map((r) => r.fullName),
    ['me/secret-api'],
  )
  // The keyword matches the description as well as the name.
  assert.equal(
    filterRepositories(rows, { ...everything, keyword: '홍보' }).length,
    1,
  )
  // A null description must be skipped, not crash the search.
  assert.deepEqual(
    filterRepositories(rows, { ...everything, keyword: 'no-blurb' }).map(
      (r) => r.fullName,
    ),
    ['me/no-blurb'],
  )
})

test('owner counts describe the whole list and roll organizations up only when there are several', async (t) => {
  const { ownerSummary } = await load(t)

  const oneOrg = ownerSummary([
    repo('me/a'),
    repo('me/b'),
    repo('acme/one', { organization: true }),
  ])
  assert.equal(oneOrg.total, 3)
  assert.equal(oneOrg.personal, 2)
  // A lone organization already has its own row, so the roll-up stays hidden.
  assert.equal(oneOrg.organizationTotal, null)

  const twoOrgs = ownerSummary([
    repo('me/a'),
    repo('acme/one', { organization: true }),
    repo('beta/two', { organization: true }),
    repo('beta/three', { organization: true }),
  ])
  assert.equal(twoOrgs.organizationTotal, 3)
  assert.deepEqual(
    twoOrgs.accounts.map((it) => `${it.login}:${it.count}`),
    ['acme:1', 'beta:2', 'me:1'],
  )
})
