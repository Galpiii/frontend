export interface SelectableRepository {
  githubRepositoryId: number
  owner: string
  name: string
  fullName: string
  private: boolean
  linked: boolean
  defaultBranch?: string | null
  // The backend forwards GitHub's nulls rather than omitting these.
  description?: string | null
  language?: string | null
  pushedAt?: string | null
}

/**
 * Account type lives on the installation, not the repository, so it is carried
 * down when the grouped response is flattened. Dropping it would leave the
 * screen unable to tell a personal repository from an organization one.
 */
export interface RepositoryRow extends SelectableRepository {
  accountLogin: string
  organization: boolean
}

export const OWNER_ALL = 'all'
export const OWNER_PERSONAL = '@personal'
export const OWNER_ORGANIZATIONS = '@organizations'

export type Visibility = 'all' | 'public' | 'private'
export type SortKey = 'recent' | 'oldest' | 'name'

export const SORT_LABELS: Record<SortKey, string> = {
  recent: '최근 업데이트순',
  oldest: '오래된 순',
  name: '이름순',
}

function pushedTime(repo: RepositoryRow) {
  if (!repo.pushedAt) return null
  const time = Date.parse(repo.pushedAt)
  return Number.isNaN(time) ? null : time
}

/** A repository with no usable timestamp sorts last in both directions. */
export function compareRepositories(
  a: RepositoryRow,
  b: RepositoryRow,
  key: SortKey,
) {
  if (key === 'name') return a.fullName.localeCompare(b.fullName)
  const first = pushedTime(a)
  const second = pushedTime(b)
  if (first === null || second === null) {
    if (first === second) return a.fullName.localeCompare(b.fullName)
    return first === null ? 1 : -1
  }
  return key === 'recent' ? second - first : first - second
}

export interface OwnerSummary {
  total: number
  personal: number
  accounts: { login: string; count: number; organization: boolean }[]
  /** Null until a roll-up adds something a single organization row does not. */
  organizationTotal: number | null
}

/**
 * Counts come from the whole list, not the filtered one: this menu exists to
 * show where repositories are before anything is narrowed down.
 */
export function ownerSummary(rows: RepositoryRow[]): OwnerSummary {
  const counts = new Map<string, { count: number; organization: boolean }>()
  for (const repo of rows) {
    const current = counts.get(repo.accountLogin)
    counts.set(repo.accountLogin, {
      count: (current?.count ?? 0) + 1,
      organization: current?.organization || repo.organization,
    })
  }
  const accounts = [...counts.entries()]
    .map(([login, it]) => ({ login, ...it }))
    .sort((a, b) => a.login.localeCompare(b.login))
  const organizations = accounts.filter((it) => it.organization)
  return {
    total: rows.length,
    personal: rows.filter((repo) => !repo.organization).length,
    accounts,
    organizationTotal:
      organizations.length > 1
        ? organizations.reduce((sum, it) => sum + it.count, 0)
        : null,
  }
}

export function filterRepositories(
  rows: RepositoryRow[],
  {
    owner,
    visibility,
    keyword,
    sort,
  }: { owner: string; visibility: Visibility; keyword: string; sort: SortKey },
) {
  const needle = keyword.trim().toLowerCase()
  return rows
    .filter(
      (repo) =>
        (owner === OWNER_ALL ||
          (owner === OWNER_PERSONAL && !repo.organization) ||
          (owner === OWNER_ORGANIZATIONS && repo.organization) ||
          repo.accountLogin === owner) &&
        (visibility === 'all' || repo.private === (visibility === 'private')) &&
        (needle === '' ||
          repo.fullName.toLowerCase().includes(needle) ||
          (repo.description ?? '').toLowerCase().includes(needle)),
    )
    .sort((a, b) => compareRepositories(a, b, sort))
}
