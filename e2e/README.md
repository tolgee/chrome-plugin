# Browser extension end-to-end tests

Playwright drives the built extension (`dist-chrome`) in Chromium against the two projects it is normally used
with, because the three usually change together:

- **tolgee-js**: its React testapp (`testapps/react`) is the page under test. It consumes the workspace
  `@tolgee/react` / `@tolgee/web` and, through `VITE_APP_IN_CONTEXT_URL`, the locally built in-context editor
  (`packages/web/dist/tolgee-in-context-tools.umd.min.js`) instead of the CDN build.
- **tolgee-platform**: a Tolgee server. Always a docker image or an already running server, never built from
  source here.

```
npm run e2e       # brings everything up, runs the specs, tears everything down
npm run e2e:ui    # the same in Playwright's UI mode
```

`npx playwright install chromium` once beforehand (the bundled Chromium is required: the headless shell does not
support extensions).

## Specs

| Spec                    | What it covers                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detection.spec.ts`     | The popup detects the page project and offers sign-in; opened during a slow page reload it recovers instead of reporting "No access to this page".                     |
| `api-key.spec.ts`       | Connect with a project API key, in-context dialog opens on alt+click and the page's requests carry `X-API-Key`, "Remove key" returns to the sign-in screen.            |
| `oauth.spec.ts`         | Connect to Tolgee through the (stubbed) identity flow with consent, requests carry `Authorization: Bearer` only, "Sign out" revokes the grant (`POST /oauth2/revoke`). |
| `multi-project.spec.ts` | Two testapps declaring different projects on the same server get two distinct OAuth sessions, each tab holding its own project id and token.                           |

The two OAuth specs need a server with the OAuth authorization server (tolgee/tolgee-platform#3893) and only run
with `TOLGEE_OAUTH=1`; otherwise they are skipped.

## Running locally

### Against the sibling worktrees

The fastest loop when the platform and tolgee-js are already checked out and running next to the extension:

```
TOLGEE_URL=http://localhost:3324 \
TOLGEE_JS_DIR=../tolgee-js \
TESTAPP_PORT=5199 \
TOLGEE_OAUTH=1 \
npm run e2e
```

- `TOLGEE_URL`: skip docker and use this server. It has to serve both the API and the webapp on one origin, which
  the consent screen needs (the platform's vite dev server with `VITE_DEV_PROXY_TARGET` does that; a bare backend
  port does not).
- `TOLGEE_JS_DIR`: use this tolgee-js checkout instead of cloning one. It is expected to be installed already; the
  workspace packages are built only if the in-context bundle is missing.
- `TESTAPP_PORT`: first of two consecutive ports for the testapps (default 5173; the second testapp takes the next
  one). Set it when your own testapp dev server is already on 5173.

Add `-- --headed` to watch the browser, `-- e2e/specs/oauth.spec.ts` to run one spec. Failed runs keep a trace
under `e2e/test-results`, open it with `npx playwright show-trace <trace.zip>`.

### Against docker

```
npm run e2e
```

Without `TOLGEE_URL` the suite starts `TOLGEE_IMAGE` (default `tolgee/tolgee:latest`) with
`e2e/docker-compose.yml` on `TOLGEE_PORT` (default 8299) and removes it afterwards. The container gets the
internal e2e-data controllers enabled and the extension's redirect URI registered
(`https://<extension id>.chromiumapp.org/`, computed from the `key` in `manifest.json` and logged at start).

Without `TOLGEE_JS_DIR` tolgee-js is cloned into `e2e/.cache/tolgee-js`, installed with
`pnpm install --frozen-lockfile` and built (`@tolgee/web` and everything the testapp depends on).

### Branch matching

The cloned tolgee-js uses the branch with the same name as the current extension branch when
`git ls-remote --heads` finds one, `main` otherwise. `TOLGEE_JS_BRANCH` overrides the name to look for; CI passes
`github.head_ref || github.ref_name`. So a change that needs both repos gets tested together by giving both
branches the same name.

## How it works

`e2e/setup/globalSetup.ts` runs before the specs:

1. rebuilds `dist-chrome` if it is older than the sources,
2. starts (or checks) the Tolgee server,
3. seeds test data (`e2e/setup/seed.ts`): a user with two projects, an `app-title` key in each, and an API key
   for the first project. With the internal e2e-data controllers available (docker) the user and the first project
   come from the platform's `oauth2-consent` test data; otherwise (a dev-profile server behind `TOLGEE_URL`, where
   `/internal` is not proxied) everything is created through the public API as `admin`/`admin`,
4. starts one vite testapp per project with `VITE_APP_TOLGEE_API_URL`, `VITE_APP_TOLGEE_PROJECT_ID` and
   `VITE_APP_IN_CONTEXT_URL` set,
5. writes all of it to `e2e/.cache/state.json` for the specs.

`globalTeardown.ts` stops the testapps, deletes the seeded projects and the docker container. Setup failures tear
down what was already started.

Every test launches its own persistent Chromium context with the extension loaded (`e2e/fixtures/extension.ts`), so
extension storage starts empty each time. The popup is opened as a tab at `chrome-extension://<id>/index.html`
after bringing the page under test to front: the popup finds its page through
`tabs.query({ active: true, currentWindow: true })`, and the popup tab itself stays in the background.

### The identity stub

Chrome's `identity.launchWebAuthFlow` window cannot be driven by Playwright, so the OAuth specs replace it in the
extension's service worker (`e2e/fixtures/oauth.ts`, `installIdentityStub`). The stub stores the authorize URL it
receives in `chrome.storage.session` and waits until a redirect URL is written back there. The test
(`completeAuthorization`) picks the authorize URL up, signs the seeded user in on the Tolgee origin (JWT from
`/api/public/generatetoken` in `localStorage.jwtToken`, which the consent screen authenticates with), opens the
URL in a normal page, clicks `[data-cy="oauth2-consent-allow"]`, intercepts the final navigation to
`https://<extension id>.chromiumapp.org/?code=...&state=...` with `page.route`, and hands that URL to the stub.
From there the extension continues exactly as in production: PKCE code exchange, token storage, injection into the
page.
