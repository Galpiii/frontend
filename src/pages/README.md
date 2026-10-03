# Pages and authentication

- `LandingPage.tsx`: GitHub login entry, with `returnTo=/projects`.
- `ProjectsPage.tsx`: project list, name editing, deletion, analysis requests and project detail links.
- `ProjectDetailPage.tsx`: fetches the latest saved project. Drafts resume the spec or repository step; connected projects show their saved spec and repositories.
- `NewProjectPage.tsx`: project creation and optional PDF upload. After creation, the name is locked; upload retries and resumed forms reuse the existing project. Skipping a spec saves `onboardingStep=REPOSITORIES` before navigation.
- `ConnectReposPage.tsx`: repository lookup, selection, GitHub App installation and connection. After linking, it requests analysis separately and reports analysis failures without treating the saved link as a failure.
- `onboardingSteps.ts`: shared step labels and the resume decision based on the saved step and resources.
- `repositoryFilters.ts`: pure repository filtering and sorting functions, tested independently.
- `NotFoundPage.tsx`: unmatched routes.
- `ComponentPreview.tsx`: development reference only, mounted at `/preview` in dev builds and excluded from the production bundle.

## Routes

`main.tsx` mounts `BrowserRouter` outside `AuthProvider`, and `App.tsx` declares the routes:

| Path                                | Screen              | Guard                                                    |
| ----------------------------------- | ------------------- | -------------------------------------------------------- |
| `/`                                 | `LandingPage`       | `GuestOnly` — a signed-in visitor is sent to `/projects` |
| `/projects`                         | `ProjectsPage`      | `RequireAuth` — a signed-out visitor is sent to `/`      |
| `/projects/:projectId`              | `ProjectDetailPage` | `RequireAuth`                                            |
| `/projects/new`                     | `NewProjectPage`    | `RequireAuth`                                            |
| `/projects/:projectId/repositories` | `ConnectReposPage`  | `RequireAuth`                                            |
| `/auth/callback`                    | redirect to `/`     | the guards forward from there                            |
| `/preview`                          | `ComponentPreview`  | dev builds only                                          |
| `*`                                 | `NotFoundPage`      | —                                                        |

While auth is still resolving, `App` renders a loading screen instead of the route tree, so a guard never decides on an unknown session. Each screen sets its own tab title with `useDocumentTitle`. Add authenticated screens as children of the `RequireAuth` route; they need no sign-in wiring of their own.

## Authentication state

`AuthProvider` holds the only copy of sign-in state (`loading` / `authenticated` / `unauthenticated`), and screens read it with `useAuth`. Pages do not handle 401 themselves: `session.ts` reports a rejected session through `onUnauthorized`, the provider flips to `unauthenticated`, and `RequireAuth` moves the visitor to the sign-in screen. A first visit with no refresh cookie is a normal signed-out load, not an expiry, so it is not reported.

Every backend call is bounded by a 15 second timeout, combined with the caller's own `AbortSignal` so existing cancellation still wins.

## Configuration

Set `VITE_API_BASE_URL=http://localhost:8080` in `.env`. Change it to the HTTPS backend origin and rebuild for deployment. Vite embeds environment values during the build; `.env.local` and mode-specific files can override `.env`. The obsolete `VITE_GITHUB_LOGIN_URL` is not used.

The backend's default frontend redirect URI must point to this SPA (for example its configured `/auth/callback` route). `returnTo` is a post-login hint, not an override for the backend's default redirect URI. Login callbacks consume `code`/`error` and navigate to `/projects`, ignoring arbitrary destinations. Installation callbacks (`installation=verified|unverified`) restore the session and return only to an exact `/projects/<positive integer>/repositories` path. External URLs and query/hash suffixes are not accepted. Production hosting must serve `index.html` for SPA routes, including `/auth/callback` and `/projects`.

## Flow

1. Navigate to `GET /auth/github/authorize?returnTo=/projects`; the backend sets its state cookie and redirects to GitHub.
2. Backend `GET /auth/github/callback` validates GitHub authorization and returns a one-time application login code to the frontend.
3. Before React renders, `main.tsx` reads and removes callback parameters using `history.replaceState`. The initialization promise is shared across StrictMode remounts so the code is exchanged only once.
4. `POST /auth/token` sends `{ code }` with `credentials: include`. The access token remains in module memory; the browser manages the backend's HttpOnly Refresh cookie.
5. On success, `AuthProvider` reports `authenticated` and the router's guards move the visitor from `/` or `/auth/callback` to `/projects`. On failure, the landing screen shows a login error without retrying the one-time code.
6. On reload, use `POST /auth/refresh` to restore the in-memory token. Refresh requests are deduplicated and send the backend-required `X-Galpi-Request` header. Before authenticated requests, refresh tokens nearing expiration. A project mutation is never automatically replayed after an uncertain response or a 401.

The frontend cannot prevent the initial callback URL from reaching the server, infrastructure logs or browser developer tools. Removing it from the address bar is not the same as preventing transmission. The page uses `Referrer-Policy: no-referrer` via a meta tag to prevent sending callback query data in outgoing referrers. Avoiding URL codes entirely requires a backend flow such as establishing an HttpOnly session and redirecting to a clean URL.

Use the same local frontend/backend hostname where cookies require same-site requests (for example `localhost:5173` and `localhost:8080`). Configure backend CORS allowed origins, callback URLs, frontend redirect, and cookie Secure/SameSite settings for deployment. Do not put secrets or tokens into frontend environment variables or browser persistent storage.

## Verification

`node --test tests/auth.test.mjs` tests the actual transpiled auth modules with mocked fetch responses: URL cleanup, one-time exchange, bearer attachment, invalid codes, refresh deduplication/CSRF header, unauthenticated restoration, request timeouts alongside caller aborts, and session-expiry notification. `npm run build` and `npm run lint` check the application.

GitHub button: official Invertocat SVG and Tailwind styling based on the [Primer guide](https://primer.style/product/components/button/), not an embedded authentication widget.

## File placement

Keep route screens in `pages`, reusable presentation components in `components/ui`, and authentication in `auth`. The small screen-specific step/filter modules stay beside their pages. `lib/projectApi.ts` shares the analysis request and result message used by both the list and repository connection screens. It does not own UI state. No additional feature folders or state-management dependencies are needed for these screens.

## Resuming creation

Project cards in the list open `/project/:projectId` (the older `/projects/:projectId` route remains supported). This reads `GET /projects/:projectId` instead of relying on potentially stale list data. A draft in `SPEC` reuses the creation form with its saved id and name; a saved document or the `REPOSITORIES` step opens repository selection. Active/archived projects and projects with linked repositories do not return to onboarding. Uploading a spec advances the step on the backend; skipping it explicitly PATCHes the step.

The project first exists on the server when the user submits the creation form. Before that, unsent name/file inputs are not a saved draft. A local PDF that has not finished uploading must be selected again, and repository selections that have not been linked are not persisted. Leaving the spec page cancels pending client requests; already committed server data remains available through the project list.

## AI consent before analysis

Both the project menu's analysis refresh and the first analysis after repository linking use `useAnalysisStart` and `AiConsentModal`. `AnalysisFlow` owns one pending user intent and prevents duplicate consent/analysis requests.

- Read `GET /consents/ai-data` immediately before analysis. Already-agreed users proceed without a consent POST.
- Otherwise show the server's `notice` with safe heading, list and emphasis formatting and its `currentVersion`. A prior `agreedVersion` marks re-consent. The checkbox always starts unchecked.
- Explicit confirmation POSTs `{ consentVersion }` to `/consents/ai-data`. Only a successful, validated agreement response permits analysis.
- `409 CONSENT-002` reloads the current notice and clears the checkbox. `403 CONSENT-001` from the analysis endpoint also returns to consent; neither condition silently agrees to a new policy or automatically retries analysis.
- Cancel/Escape dismiss during lookup or saving invalidates late responses. Backdrop clicks never dismiss the consent modal. A consent save already received by the server may persist, but cancellation never dispatches analysis. Once analysis is dispatched, closing is disabled until its bounded request settles.
- Before the repository connection POST, `requestConsent()` checks/saves agreement without starting analysis. Cancelling stays on repository selection without linking anything. Connection loading starts only after agreement. After linking, navigate immediately to the project home. The server enforces consent at dispatch; a policy change is shown inline without reopening a modal. Already-saved links are preserved on failure.
- Confirmed 4xx analysis refusals can be retried manually. Network failures, 5xx and unreadable success bodies have uncertain outcomes and are never automatically replayed.
- No consent is cached in local storage. Each new analysis intent checks the server's current policy.

`tests/analysisFlow.test.mjs` covers explicit consent, cancellation races, version changes, analysis consent rejection, duplicate submission, unmount and API error classification. The project home polls project detail for the latest analysis status. Detailed analysis-result screens remain separate work.

## Session check before creation

Creating a new project passes `verifySession: true` to `authenticatedFetch`. It refreshes the session before the mutation even when the in-memory access token has time left. A missing/rejected refresh cookie (401) expires the UI session and prevents the project POST. Transient failures also prevent creation and remain retryable. This is a client-side recheck; deleting a refresh cookie does not itself revoke an already issued access token on the backend.

## Current consent flow during development

At the user's request, the real consent modal now renders `docs/ai-data-consent.draft.md` directly, in both development and production builds. There is no separate preview or draft-only blocking state. Both AI processing and overseas-transfer choices must be checked before confirmation. Future text edits belong in that Markdown file.

Consent status and saving still use the existing GET/POST `/consents/ai-data` API and the server-provided `currentVersion`. The local displayed document is not stored by that API: the backend still records its own version/text hash. This temporary integration enables development; publishing a matching backend notice/version remains separate work.

PDF registration reuses the server-confirmed current agreement for subsequent projects. Checking agreement does not open a modal. It no longer requires the proposed `coveredData` response extension. After a successful consent POST, project creation (with session revalidation) and PDF upload proceed in that order. Cancellation, failed saving, unmount and unchecked choices do not authorize an upload. A version conflict clears the choices and requires confirmation again. Skipping the PDF continues without this consent step. After repository linking, navigate immediately to `/project/:projectId`; the project home dispatches the queued analysis intent without reopening the consent flow. Analysis failures never undo the saved repository links.

`tests/analysisFlow.test.mjs` covers the legacy server response without scope fields, explicit PDF confirmation, version conflicts, cancellation races and existing repository analysis behavior.

## Project home and analysis handoff

The reference HTML's sidebar, current-state banner, summary metrics and repository rows form the project home. PR summary counts and repository collection states use existing backend endpoints. CI, repository language and feature matches are not invented. Creation still completes specification registration/skipping and repository linking before entering this home.

Verified against the adjacent backend controllers/DTOs: `GET /projects/{id}` exposes `lastAnalysis` (run id/status), and `GET /analyses/{analysisRunId}` exposes per-repository results. This home uses the first endpoint, every five seconds while mounted; it does not invent an analysis-list endpoint. Repository collection states and incomplete-reason notices use the latter endpoint.

`analysis/projectAnalysis.ts` owns in-memory intents and submitted requests across route changes and StrictMode remounts. Linking queues an intent synchronously, then navigates. The home consumes it once, checks the latest server state before POST, and distinguishes local requesting, confirmed queued/running, refusal, and uncertain acceptance. The list's manual analysis action also hands off to this owner. A fresh page load has no intent and only reads state.

A clear refusal offers a manual retry. Network/timeout/5xx, HTTP 408/425 and conflicts (409, which can mean an existing run) reconcile through GET only. A missing run is not proof that a timed-out POST was rejected; no automatic or manual resend is offered while that attempt remains uncertain. Old terminal run ids cannot confirm a new request. An unreadable status response stays a read error. A consent refusal is displayed inline with guidance to explicitly review consent through the list; no modal opens automatically after linking.

Tests in `tests/analysisFlow.test.mjs` cover slow responses, duplicate intent consumption, route subscription disposal, manual retry, uncertain outcomes, stale completed runs, GET deduplication and reload restoration. Browser checks additionally exercise the real StrictMode routes with mocked APIs at desktop/mobile widths.

## Overview API coverage

Confirmed against both local backend source and running `/v3/api-docs` on 2026-09-29:

- `GET /projects/{id}`: repository visibility, default branch, access status, last sync, latest analysis, spec filename and extraction state.
- `GET /projects/{id}/pull-requests/summary`: project/repository PR totals and failed counts. It has no per-repository completed count.
- `GET /projects/{id}/pull-requests?analysisStatus=COMPLETED&size=1[&repositoryId=…]`: `totalElements` supplies exact completed counts; do not subtract failed counts from totals. Requests are batched at most four repositories at a time. Overview data refreshes 15 seconds after each fetch finishes; failures stay unknown rather than showing zero.
- `GET /analyses/{id}`: individual collection states and incomplete reasons. Collection completion is distinct from PR summary completion.
- `?tab=prs`: paginated PR list with repository/status filters and safe GitHub source links.
- `?tab=match`: 기능대조 진입점. 기존 `?tab=spec` 링크도 같은 화면으로 복원한다. 기존 프로젝트에서 명세서 PDF를 등록할 때 동일한 명시적 동의 흐름을 사용하며, 프로젝트 재생성이나 저장소 온보딩으로 돌아가지 않는다. 미등록, 추출 대기/진행, 실패, 완료, 알 수 없는 서버 상태를 구분한다.
- 기능명세서 업로드의 네트워크 오류, 408/425, 5xx는 접수 여부가 불확실한 상태로 처리한다. 자동 재전송하지 않고 `GET /projects/{id}`로 등록 여부를 확인한 뒤에만 다시 업로드할 수 있다.
- 기능별 대조 결과 보기는 현재 제공 범위를 명확히 안내하고 PR 목록으로 연결한다. 기능 목록 조회·검토, 명세서 교체와 실제 기능–PR 대조는 지원 API가 생길 때까지 동작하는 것처럼 표현하지 않는다.
- Repository addition reuses the connection flow. A per-row confirmation calls `DELETE /projects/{id}/repositories/{repositoryId}` with the internal repository id, then refreshes data. Active/uncertain analysis disables removal.

Feature–PR matching, CI, sharing and a project description are not currently provided by the relevant backend APIs. The connected-repository response does not contain language (the GitHub selection API does, but querying every installation merely to decorate the overview is avoided). The screenshot's unsupported fields are omitted or explicitly marked as pending. The overview's “확인 필요” count is specifically failed PR summaries, not a fabricated combined review score. Header logo navigation remains shared; removed header context/actions stay removed.

## Scoped collection when adding repositories

Repository linking now hands its returned **internal** `repositoryId` values to the analysis intent. It calls `POST /projects/{id}/analyses/selected` with `{ repositoryIds: [...] }`; explicit project-wide refresh continues to use the original POST `/projects/{id}/analyses`. The separate route fails closed on older servers (404), never silently falling back to full collection. Manual retries retain the original scope. If a different run is already active, scoped submission remains retryable after it finishes instead of being falsely reported as accepted.

The companion backend change validates every selected repository against the current project's linked repositories, deduplicates IDs, and checks GitHub access only for that subset. Empty, invalid or foreign IDs never widen the scope. `GET /projects/{id}/analyses/repositories` returns each connected repository's own latest target status, so old completed repositories retain their state while a new repository runs, including after a reload. The latest project run alone no longer supplies all repository row badges.

These endpoints require the updated backend to be running. The backend changes are on its `feature/#11` branch and require no database migration.

## PR list and right-side panels

PR failures take priority over the missing-spec prompt on the overview. The failure count links to `?tab=prs&status=FAILED`; repository rows retain their collection state but show an additional PR-failure warning when required.

The PR list groups only the current page by repository (page totals are not mislabeled as repository totals). Repository/status filters, exact GitHub author login, number/title search and server-supported sort values use the existing paginated endpoint. Filters live in the URL. `panel=analysis` opens analysis management; `pr=<internal PR id>` opens the detail drawer. Native dialog behavior traps focus, supports Escape and returns focus to the trigger; only one panel is opened by UI actions.

Analysis management uses `POST /projects/{id}/pull-request-analyses/retry` to retry failed summaries, without recollecting repositories or regenerating successful summaries. A module-owned request state prevents concurrent dispatch through remounts. Unknown outcomes never replay; status checks are GET only. An accepted retry can be requested again only after an explicit status check confirms no summaries remain pending. Full collection remains a separate explicit action using the existing analysis owner.

PR detail calls `GET /pull-requests/{id}` and checks membership in the current project's repositories. It separates GitHub metadata/files from AI summary/change type/time, shows failed/pending/missing results and truncation notices, escapes remote content, and restricts source links to HTTPS GitHub URLs.

Collection criteria remain read-only (MERGED/default branch/all time). Open/Closed collection, configurable periods, PR exclusions and feature matching are not supported by the current backend and are not presented as working controls. No new backend changes are needed for these panels.
