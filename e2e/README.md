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

| Spec                          | What it covers                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `detection.spec.ts`           | What the popup makes of the page: project detected, page still reloading, no Tolgee at all, no content script (about:blank), another tab's handshakes, a legacy SDK, two Tolgee instances (iframe). |
| `sign-in.spec.ts`             | The sign-in screen: no project declared, server shown and changeable, invalid server URL, unreachable server, switching to the API-key screen and back.                                          |
| `api-key-screen.spec.ts`      | The API-key screen: empty key, foreign key, unreachable server, valid key (Enter submits), key masking, a page whose config already carries the key (development mode).                          |
| `api-key.spec.ts`             | Connect with a project API key, in-context dialog opens on alt+click and the page's requests carry `X-API-Key`, "Remove key" returns to the sign-in screen.                                      |
| `connected-api-key.spec.ts`   | The connected panel for a key: contents, editing switch off/on (page credentials cleared and restored), Remove key with editing off, a key revoked on the server.                               |
| `oauth.spec.ts`               | Connect to Tolgee through the (stubbed) identity flow with consent, requests carry `Authorization: Bearer` only, "Sign out" revokes the grant (`POST /oauth2/revoke`).                           |
| `oauth-session.spec.ts`       | OAuth session states: account name, session revoked on the server and "Sign in again", page declaring a project the token cannot reach, sign out clearing every tab, consent denied, token refresh. |
| `multi-project.spec.ts`       | Two testapps declaring different projects on the same server get two distinct OAuth sessions, each tab holding its own project id and token.                                                     |
| `branch.spec.ts`              | Branch row and inline branch editor. Skipped, with the reason printed, on a server where branching is not available.                                                                             |
| `screenshot.spec.ts`          | In-context screenshots: the dialog's camera button makes the worker capture the tab, the upload is multipart with the right credential header only, the screenshot lands in the gallery and on the key (API key and OAuth); a key without `screenshots.upload` gets no camera, one losing the scope gets the "Operation not permitted" alert. |
| `new-key.spec.ts`             | Alt+click on a text whose key the project lacks opens an enabled create form (no permissions alert), saving creates the key with the typed translation, on both credential paths. |

The OAuth specs need a server with the OAuth authorization server (tolgee/tolgee-platform#3893). The setup probes
`/.well-known/oauth-authorization-server` and `/oauth2/authorize` with the extension's client id and redirect URI;
when the server has no authorization server the OAuth specs are skipped with that reason, when it has one but
rejects the extension's redirect URI the docker setup fails (its `docker-compose.yml` registers the URI) and a
`TOLGEE_URL` server skips them with the reason.

Every popup state, alert and transition has at least one assertion in these specs. `e2e/fixtures/testapp.ts`
rewrites the testapp's inlined env on the way to the browser (`declareProject`, `declareApiKey`) and serves extra
pages on its origin (`servePage`), so the two testapps can play every page shape the popup distinguishes.

## Running locally

### Against the sibling worktrees

The fastest loop when the platform and tolgee-js are already checked out and running next to the extension:

```
TOLGEE_URL=http://localhost:3324 \
TOLGEE_JS_DIR=../tolgee-js \
TESTAPP_PORT=5199 \
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

A change that needs a sibling repo gets tested together with it by giving both branches the same name:

- **tolgee-js**: the cloned checkout uses the branch with the same name as the current extension branch when
  `git ls-remote --heads` finds one, `main` otherwise. `TOLGEE_JS_BRANCH` overrides the name to look for; CI passes
  `github.head_ref || github.ref_name`.
- **tolgee-platform**: the platform publishes no per-branch image, so the CI workflow (`.github/workflows/e2e.yml`)
  looks for a platform branch named like the extension's, and when there is one checks it out into `.platform/`,
  builds it (`./gradlew dockerPrepare` plus `docker build` of `build/docker`, the same steps as the platform's own
  image build) into `tolgee/tolgee:e2e-branch` and runs the suite with `TOLGEE_IMAGE` pointing at it. That adds
  10 to 15 minutes to the job. Without one the job uses `tolgee/tolgee:latest`; a manual run (`workflow_dispatch`)
  can name the platform branch to build in its `platform_branch` input. Locally, build the image the same
  way from a platform checkout **without** the billing repo next to it (a `../billing` sibling is compiled into the
  image and changes what the server does) and pass it as `TOLGEE_IMAGE`.

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
