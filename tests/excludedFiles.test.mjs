import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadSources } from './helpers/sources.mjs'

async function load(t) {
  const load = await loadSources(t, [
    'lib/api',
    'features/auth/session',
    'features/consent/api',
    'features/pull-requests/api',
    'features/pull-requests/excludedFiles',
  ])
  return load('features/pull-requests/excludedFiles')
}

function detail(id, extra = {}) {
  return {
    id,
    number: id,
    htmlUrl: `https://github.com/team/repo/pull/${id}`,
    repository: { id: 9, fullName: 'team/repo' },
    files: [{ path: `assets/${id}.png`, patchOmitted: true }],
    filesTruncated: false,
    incompleteReasons: ['BINARY', 'SECRET_REDACTED'],
    ...extra,
  }
}

function page(ids, totalPages = 1) {
  return {
    totalPages,
    totalElements: ids.length,
    pullRequests: ids.map((id) => detail(id)),
  }
}

test('only confirmed missing patches are listed, preserving the original file data', async (t) => {
  const { getExcludedFilePaths } = await load(t)
  const files = Object.freeze([
    Object.freeze({ path: 'src/app.ts', patchOmitted: false }),
    Object.freeze({ path: 'assets/logo.png', patchOmitted: true }),
    Object.freeze({ path: 'assets/logo.png', patchOmitted: true }),
    Object.freeze({ path: 'src/large.ts', patchOmitted: true }),
  ])
  assert.deepEqual(getExcludedFilePaths(detail(1, { files })), [
    'assets/logo.png',
    'src/large.ts',
  ])
  assert.equal(files.length, 4)
})

test('repository files include every PR page and duplicate PRs are read once', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  const listCalls = []
  const detailCalls = []
  const signal = new AbortController().signal
  const result = await loadRepositoryExcludedFiles(20, 9, signal, {
    getPrPage: async (projectId, options, receivedSignal) => {
      assert.equal(projectId, 20)
      assert.equal(receivedSignal, signal)
      listCalls.push(options)
      return options.page === 0 ? page([1, 2], 2) : page([2, 3], 2)
    },
    getPullRequestDetail: async (id, receivedSignal) => {
      assert.equal(receivedSignal, signal)
      detailCalls.push(id)
      return detail(id)
    },
  })
  assert.deepEqual(listCalls, [
    { repositoryId: 9, page: 0, size: 100 },
    { repositoryId: 9, page: 1, size: 100 },
  ])
  assert.deepEqual(detailCalls, [1, 2, 3])
  assert.deepEqual(
    result.groups.map((group) => group.paths),
    [['assets/1.png'], ['assets/2.png'], ['assets/3.png']],
  )
  assert.equal(result.unavailablePrCount, 0)
  assert.equal(result.incomplete, false)
})

test('detail requests never exceed four concurrent reads', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  let active = 0
  let peak = 0
  const result = await loadRepositoryExcludedFiles(
    20,
    9,
    new AbortController().signal,
    {
      getPrPage: async () => page([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      getPullRequestDetail: async (id) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setImmediate(resolve))
        active--
        return detail(id)
      },
    },
  )
  assert.equal(peak, 4)
  assert.equal(result.groups.length, 9)
})

test('failed and foreign details leave confirmed files visible and mark the missing PRs', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  const result = await loadRepositoryExcludedFiles(
    20,
    9,
    new AbortController().signal,
    {
      getPrPage: async () => page([1, 2, 3, 4]),
      getPullRequestDetail: async (id) => {
        if (id === 2) throw new Error('Unavailable')
        if (id === 3) return detail(id, { repository: { id: 10 } })
        if (id === 4) return detail(99)
        return detail(id, { filesTruncated: true })
      },
    },
  )
  assert.deepEqual(
    result.groups.map((group) => group.id),
    [1],
  )
  assert.equal(result.unavailablePrCount, 3)
  assert.equal(result.incomplete, true)
})

test('file limits mark the listing incomplete even when no missing patches are identifiable', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  const result = await loadRepositoryExcludedFiles(
    20,
    9,
    new AbortController().signal,
    {
      getPrPage: async () => page([1]),
      getPullRequestDetail: async () =>
        detail(1, {
          files: [{ path: 'src/app.ts', patchOmitted: false }],
          incompleteReasons: ['PR_CONTENT_LIMIT'],
        }),
    },
  )
  assert.deepEqual(result.groups, [])
  assert.equal(result.incomplete, true)
})

test('closing during a lookup cancels it instead of returning an incomplete success', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  const controller = new AbortController()
  const readIds = []
  await assert.rejects(
    loadRepositoryExcludedFiles(20, 9, controller.signal, {
      getPrPage: async () => page([1, 2, 3, 4, 5], 2),
      getPullRequestDetail: async (id) => {
        readIds.push(id)
        controller.abort()
        return detail(id)
      },
    }),
    { name: 'AbortError' },
  )
  assert.deepEqual(readIds, [1, 2, 3, 4])
})

test('a foreign repository page is rejected before reading any details', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  await assert.rejects(
    loadRepositoryExcludedFiles(20, 9, new AbortController().signal, {
      getPrPage: async () => ({
        ...page([1]),
        pullRequests: [detail(1, { repository: { id: 10 } })],
      }),
      getPullRequestDetail: async () =>
        assert.fail('foreign PR must not be read'),
    }),
    /이 저장소의 파일 목록을 확인할 수 없습니다/,
  )
})

test('a failed list page is not reported as an empty file list', async (t) => {
  const { loadRepositoryExcludedFiles } = await load(t)
  await assert.rejects(
    loadRepositoryExcludedFiles(20, 9, new AbortController().signal, {
      getPrPage: async () => {
        throw new Error('List unavailable')
      },
      getPullRequestDetail: async () => assert.fail('list failed'),
    }),
    /List unavailable/,
  )
})
