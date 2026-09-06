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

| Spec                          | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detection.spec.ts`           | What the popup makes of the page: project detected, page still reloading, no Tolgee at all, no content script (about:blank), another tab's handshakes, a legacy SDK, an SDK without the proxied-request protocol (sign-in refused, API key offered), two Tolgee instances (iframe). |
| `sign-in.spec.ts`             | The sign-in screen: no project declared, server shown as a link and editable behind the header gear (panel stays open on an unusable URL), unreachable server, the typed key and the server surviving a switch to the API-key screen and back.                                                                                                                                                                                                |
| `api-key-screen.spec.ts`      | The API-key screen: empty key, server shared with the sign-in screen behind the gear, foreign key, unreachable server, a verified key collapsing into a read-only preview with the success alert and a button naming the project ("Use another key" reopens the field, Enter submits), a view-only key warned about but connectable, key masking.                                                                                             |
| `site-key.spec.ts`            | A page whose own config carries the API key (development mode): the site-key screen (no editing switch, no Remove key, "Use another key"), overriding it with another key (no editing switch there either), the override surviving a fresh popup, "Back to site's key" handing the page back to its own key (the dialog opens with it instead of asking to sign in).                                                                                    |
| `api-key.spec.ts`             | Connect with a project API key, the connected panel's summary sentence (also on a popup opened after the reload), the page holds only the session connection while the worker sends the dialog's requests with `X-API-Key`, "Remove key" returns to the sign-in screen and leaves the page without a credential (dialog asks to sign in). |
| `api-key-isolation.spec.ts`   | A key entered in the popup is nowhere a page script can read it (storage, cookies, DOM, everything reachable from `window`), the page's own requests carry no credential, the worker's carry the key, a page script can only reach the key's project on the connected server; a key in the site's own code is still sent by the page itself. |
| `api-key-legacy-sdk.spec.ts`  | An SDK from before the proxied-request protocol (the testapp handshaking without `protocolVersion`): the sign-in screen shows the SDK alert next to "Use an API key instead", connecting writes the key into the page's `__tolgee_apiKey` (no session marker), the page's own requests carry `X-API-Key` and the worker sends none, an edit saves, the reopened popup shows the connected panel with the "uses it directly" sentence and no SDK alert, Remove key clears the slot and the dialog asks to sign in. |
| `api-key-other-project.spec.ts`| A key for another project than the page declares: the popup names the key's project, every dialog request goes to the key's project (permissions lookup included, no 404), and saving an edit lands in the key's project. |
| `connected-api-key.spec.ts`   | The connected panel for a key: contents, editing switch off/on (page credentials cleared, the dialog says editing is switched off rather than asking to sign in, then restored), Remove key with editing off (the dialog asks to sign in again), a key revoked on the server.                                                                                                                                                                 |
| `oauth.spec.ts`               | Connect to Tolgee through the (stubbed) identity flow with consent; the page sends no project request itself, the worker sends them with `Authorization: Bearer` only; a reload renders through the worker right away; "Sign out" revokes the grant (`POST /oauth2/revoke`).                                                                                                                                                                  |
| `oauth-session.spec.ts`       | OAuth session states: account name, session revoked on the server (dialog says "not signed in", popup offers "Sign in again"), page declaring a project the session cannot reach, sign out clearing every tab, editing switched off (the dialog says so, a reopened popup keeps it, sign out turns it into the sign-in alert), consent denied, an expired token refreshed by the worker before it sends.                                        |
| `multi-project.spec.ts`       | Two testapps declaring different projects on the same server get two distinct OAuth sessions; the worker sends each tab's dialog requests to that tab's project with that project's token.                                                                                                                                                                                                                                                    |
| `oauth-wrong-project.spec.ts` | A consent bound to another project than the page declares, or a page declaring a project that does not exist, is refused: the popup names the project and host, nothing is stored or injected, the grant is revoked, the dialog still asks to sign in. A consent for all projects connects. With the popup closed during the flow (as the identity window closes it) the refusal is parked for the origin and shown by the next popup, dismissing it leaves a clean sign-in screen, and a later successful connect drops it. |
| `branch.spec.ts`              | Branch row and inline branch editor. Skipped, with the reason printed, on a server where branching is not available.                                                                                                                                                                                                                                                                                                                          |
| `screenshot.spec.ts`          | In-context screenshots: the dialog's camera button makes the worker capture the tab and upload it with the credential it holds (API key or session token), the image never enters the page; the same image size and key positions come out with either credential; a dropped image keeps its name and type through the worker; a key without `screenshots.upload` gets no camera, one losing the scope gets the "Operation not permitted" alert. |
| `new-key.spec.ts`             | Alt+click on a text whose key the project lacks opens an enabled create form (no permissions alert), saving creates the key with the typed translation, on both credential paths.                                                                                                                                                                                                                                                             |
| `token-isolation.spec.ts`     | After an OAuth sign-in the token is nowhere a page script can read it and no page request carries a credential; a page script asking the extension for `/v2/user`, another server, another project, or from a cross-origin frame is refused, a page nobody signed in gets no session.                                                                                                                                                         |

The OAuth specs need a server with the OAuth authorization server (tolgee/tolgee-platform#3893). The setup probes
`/.well-known/oauth-authorization-server` and `/oauth2/authorize` with the extension's client id and redirect URI;
when the server has no authorization server the OAuth specs are skipped with that reason, when it has one but
rejects the extension's redirect URI the docker setup fails (its `docker-compose.yml` registers the URI) and a
`TOLGEE_URL` server skips them with the reason.

Every popup state, alert and transition has at least one assertion in these specs. `e2e/fixtures/testapp.ts`
rewrites the testapp's inlined env on the way to the browser (`declareProject`, `declareApiKey`) and serves extra
pages on its origin (`servePage`), so the two testapps can play every page shape the popup distinguishes.

## Firefox

The suite is Chromium-only: Playwright cannot load an extension into Firefox, so the Firefox zip (`dist-firefox`,
an event page instead of a service worker) gets no automated coverage. Before a Firefox release, check by hand
with the zip loaded as a temporary add-on: sign in through the popup, alt+click a text and save a change (a
proxied dialog request), take a screenshot from the dialog, connect with an API key and repeat both, and click
"Open the Tolgee plugin" in the dialog's signed-out alert (which opens the popup as a window there). Firefox 115+
has `storage.session`, where a refused sign-in is parked until the popup opens again; older builds fall back to
`storage.local`.

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
  10 to 15 minutes to the job. Without one the job builds platform `main` the same way, because the published
  `tolgee/tolgee:latest` lags main by a release; a manual run (`workflow_dispatch`)
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
