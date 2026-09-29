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

Project cards in the list open `/projects/:projectId`. This reads `GET /projects/:projectId` instead of relying on potentially stale list data. A draft in `SPEC` reuses the creation form with its saved id and name; a saved document or the `REPOSITORIES` step opens repository selection. Active/archived projects and projects with linked repositories do not return to onboarding. Uploading a spec advances the step on the backend; skipping it explicitly PATCHes the step.

The project first exists on the server when the user submits the creation form. Before that, unsent name/file inputs are not a saved draft. A local PDF that has not finished uploading must be selected again, and repository selections that have not been linked are not persisted. Leaving the spec page cancels pending client requests; already committed server data remains available through the project list.

## AI consent before analysis

Both the project menu's analysis refresh and the first analysis after repository linking use `useAnalysisStart` and `AiConsentModal`. `AnalysisFlow` owns one pending user intent and prevents duplicate consent/analysis requests.

- Read `GET /consents/ai-data` immediately before analysis. Already-agreed users proceed without a consent POST.
- Otherwise show the server's `notice` with safe heading, list and emphasis formatting and its `currentVersion`. A prior `agreedVersion` marks re-consent. The checkbox always starts unchecked.
- Explicit confirmation POSTs `{ consentVersion }` to `/consents/ai-data`. Only a successful, validated agreement response permits analysis.
- `409 CONSENT-002` reloads the current notice and clears the checkbox. `403 CONSENT-001` from the analysis endpoint also returns to consent; neither condition silently agrees to a new policy or automatically retries analysis.
- Cancel/Escape dismiss during lookup or saving invalidates late responses. Backdrop clicks never dismiss the consent modal. A consent save already received by the server may persist, but cancellation never dispatches analysis. Once analysis is dispatched, closing is disabled until its bounded request settles.
- Before the repository connection POST, `requestConsent()` checks/saves agreement without starting analysis. Cancelling stays on repository selection without linking anything. Connection loading starts only after agreement. After linking, analysis checks consent again in case the server policy changed; already-saved links are preserved on subsequent failure. Leaving the page ignores late responses.
- Confirmed 4xx analysis refusals can be retried manually. Network failures, 5xx and unreadable success bodies have uncertain outcomes and are never automatically replayed.
- No consent is cached in local storage. Each new analysis intent checks the server's current policy.

`tests/analysisFlow.test.mjs` covers explicit consent, cancellation races, version changes, analysis consent rejection, duplicate submission, unmount and API error classification. Progress polling and analysis-result screens remain separate work.

## Session check before creation

Creating a new project passes `verifySession: true` to `authenticatedFetch`. It refreshes the session before the mutation even when the in-memory access token has time left. A missing/rejected refresh cookie (401) expires the UI session and prevents the project POST. Transient failures also prevent creation and remain retryable. This is a client-side recheck; deleting a refresh cookie does not itself revoke an already issued access token on the backend.

## Expanded consent document

`docs/ai-data-consent.draft.md` adapts the requested document to 갈피. It is an unpublished draft: provider, destination, retention/training policy, actual transmitted fields, withdrawal route and effective date still need confirmation. Do not publish the bracketed placeholders. Register the finalized text as a **new backend consent version**, preserving the existing version/text/hash history. The frontend continues rendering `GET /consents/ai-data` so the displayed document matches the saved version rather than silently replacing it with local copy.

`ConsentNotice` supports three heading levels, paragraphs, lists, bold text and blockquotes without rendering HTML. When the versioned document includes 국외 이전, the modal requires separate unchecked AI-processing and overseas-transfer checkboxes before the existing combined version-consent POST. The present API stores a single version agreement, not separate per-purpose records; separate audit records would require a backend contract change.

## Draft preview and feature-spec consent

In development, the new-project page, component gallery (`/preview`), and stable consent-modal states expose **동의서 초안 미리보기**. The preview renders `docs/ai-data-consent.draft.md` in the same document renderer. It contains no API calls; its checkboxes only demonstrate the layout and the agreement button is always disabled. Closing it restores the previous screen/modal. The preview and draft text are excluded from production output.

Before creating a project for a selected PDF, `NewProjectPage` awaits `requestConsent('feature-spec')`. Cancelling retains the name and file without creating a project or uploading the PDF. Skipping the PDF does not request AI consent. Once agreement succeeds, the existing creation/session-validation/upload path runs once. In-progress form submissions are guarded synchronously to prevent duplicate requests.

The current backend notice covers Git data only. PDF uploads therefore remain **blocked with a skip option** until the backend publishes a finalized notice that explicitly covers PDFs and implements the following contract extension. This is not an existing backend capability:

- Add optional `coveredData: string[]` to both GET and POST `/consents/ai-data` responses. Include `FEATURE_SPEC_DOCUMENT` only for a finalized version whose actual text covers PDF transfer. Missing coverage must not inherit a previous Git agreement.
- The frontend verifies this field on lookup and after saving, including after version conflicts. Unknown or absent scopes do not authorize PDF upload.
- The backend must enforce current scoped consent before accepting/processing `/projects/{id}/feature-specs`, and again before any asynchronous external AI transmission as appropriate. Client-side gating alone cannot enforce this for other clients or close a version-change race.
- Preserve the existing version/text/hash history; never label the unpublished draft as a saved consent version. The actual server has not been changed in this frontend task.

Example future response (illustrative version, not a real published policy):

```json
{
  "data": {
    "currentVersion": "approved-version",
    "notice": "Finalized notice including PDF transfer",
    "agreed": false,
    "agreedVersion": null,
    "coveredData": ["FEATURE_SPEC_DOCUMENT"]
  }
}
```
