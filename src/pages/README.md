# Pages and authentication

- `LandingPage.tsx`: GitHub login entry, with `returnTo=/projects`.
- `ProjectsPage.tsx`: authenticated project home. Fetches `GET /projects` with loading, empty, error and pagination states. The creation screen and POST handler have been removed; the create button is disabled and labeled as being prepared until that flow is implemented.
- `ComponentPreview.tsx`: development reference only.

## Configuration

Set `VITE_API_BASE_URL=http://localhost:8080` in `.env`. Change it to the HTTPS backend origin and rebuild for deployment. Vite embeds environment values during the build; `.env.local` and mode-specific files can override `.env`. The obsolete `VITE_GITHUB_LOGIN_URL` is not used.

The backend's default frontend redirect URI must point to this SPA (for example its configured `/auth/callback` route). `returnTo` is a post-login hint, not an override for the backend's default redirect URI. This client consumes `code`/`error` on arrival and always navigates to `/projects` after successful authentication, ignoring arbitrary redirect destinations in the query. Production hosting must serve `index.html` for SPA routes, including `/auth/callback` and `/projects`.

## Flow

1. Navigate to `GET /auth/github/authorize?returnTo=/projects`; the backend sets its state cookie and redirects to GitHub.
2. Backend `GET /auth/github/callback` validates GitHub authorization and returns a one-time application login code to the frontend.
3. Before React renders, `main.tsx` reads and removes callback parameters using `history.replaceState`. The initialization promise is shared across StrictMode remounts so the code is exchanged only once.
4. `POST /auth/token` sends `{ code }` with `credentials: include`. The access token remains in module memory; the browser manages the backend's HttpOnly Refresh cookie.
5. On success, replace the current history entry with `/projects`. On failure, show a login error without retrying the one-time code.
6. On reload, use `POST /auth/refresh` to restore the in-memory token. Refresh requests are deduplicated and send the backend-required `X-Galpi-Request` header. Before authenticated requests, refresh tokens nearing expiration. A project mutation is never automatically replayed after an uncertain response or a 401.

The frontend cannot prevent the initial callback URL from reaching the server, infrastructure logs or browser developer tools. Removing it from the address bar is not the same as preventing transmission. The page uses `Referrer-Policy: no-referrer` via a meta tag to prevent sending callback query data in outgoing referrers. Avoiding URL codes entirely requires a backend flow such as establishing an HttpOnly session and redirecting to a clean URL.

Use the same local frontend/backend hostname where cookies require same-site requests (for example `localhost:5173` and `localhost:8080`). Configure backend CORS allowed origins, callback URLs, frontend redirect, and cookie Secure/SameSite settings for deployment. Do not put secrets or tokens into frontend environment variables or browser persistent storage.

## Verification

`node --test tests/auth.test.mjs` tests the actual transpiled auth modules with mocked fetch responses: URL cleanup, one-time exchange, bearer attachment, invalid codes, refresh deduplication/CSRF header, and unauthenticated restoration. `npm run build` and `npm run lint` check the application.

GitHub button: official Invertocat SVG and Tailwind styling based on the [Primer guide](https://primer.style/product/components/button/), not an embedded authentication widget.
