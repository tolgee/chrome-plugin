import { expect, test } from '../fixtures/extension';
import { openTestapp, sessionItem } from '../fixtures/testapp';
import { readState, type RunState } from '../setup/state';

// The platform gates branching behind an enterprise feature. Its own e2e suite enables features through this debug
// endpoint (`setFeature` in the platform's Cypress helpers), which works whenever the internal controllers are on
// and the billing module is off, as in the docker image.
const FEATURE_TOGGLE = 'internal/features/toggle?feature=BRANCHING';
const FEATURE_BRANCH = 'extension-e2e';
const DEFAULT_BRANCH = 'main';

const isHtml = (res: Response) =>
  (res.headers.get('content-type') ?? '').includes('text/html');

const toggleBranching = async (
  tolgeeUrl: string,
  enabled: boolean | null
): Promise<string | undefined> => {
  const query = enabled === null ? '' : `&enabled=${enabled}`;
  const res = await fetch(`${tolgeeUrl}/${FEATURE_TOGGLE}${query}`, {
    method: 'PUT',
    headers: { Accept: 'application/json' },
  });
  if (res.ok && !isHtml(res)) {
    return undefined;
  }
  const body = isHtml(res) ? '' : (await res.text()).slice(0, 200);
  return `cannot enable BRANCHING through ${tolgeeUrl}/${FEATURE_TOGGLE}: HTTP ${res.status} ${body}`.trim();
};

class ProjectApi {
  private token = '';

  constructor(
    private readonly tolgeeUrl: string,
    private readonly projectId: number
  ) {}

  async login(user: RunState['user']) {
    const res = await fetch(`${this.tolgeeUrl}/api/public/generatetoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!res.ok) {
      throw new Error(`login as ${user.username} failed: HTTP ${res.status}`);
    }
    this.token = (await res.json()).accessToken;
  }

  private async request(method: string, path: string, body?: unknown) {
    const res = await fetch(
      `${this.tolgeeUrl}/v2/projects/${this.projectId}${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    );
    if (!res.ok) {
      throw new Error(
        `${method} /v2/projects/${this.projectId}${path} failed: HTTP ${
          res.status
        } ${await res.text()}`
      );
    }
    return res.json();
  }

  // Editing keeps every other setting as it is; turning branching on creates the default branch.
  async enableBranching() {
    const project = await this.request('GET', '');
    await this.request('PUT', '', {
      name: project.name,
      slug: project.slug,
      baseLanguageId: project.baseLanguage?.id,
      useNamespaces: project.useNamespaces,
      useBranching: true,
      defaultNamespaceId: project.defaultNamespace?.id,
      description: project.description,
      icuPlaceholders: project.icuPlaceholders,
      suggestionsMode: project.suggestionsMode,
      translationProtection: project.translationProtection,
    });
  }

  async branchNames(): Promise<string[]> {
    const data = await this.request('GET', '/branches?size=100');
    return (data._embedded?.branches ?? []).map((b: any) => b.name);
  }

  async createBranch(name: string) {
    const data = await this.request('GET', '/branches?size=100');
    const origin = data._embedded.branches.find((b: any) => b.isDefault);
    await this.request('POST', '/branches', {
      name,
      originBranchId: origin.id,
    });
  }
}

let skipReason: string | undefined;

test.beforeAll(async () => {
  const state = readState();
  skipReason = await toggleBranching(state.tolgeeUrl, true);
  if (skipReason) {
    return;
  }
  const api = new ProjectApi(state.tolgeeUrl, state.apps[0].projectId);
  await api.login(state.user);
  await api.enableBranching();
  if (!(await api.branchNames()).includes(FEATURE_BRANCH)) {
    await api.createBranch(FEATURE_BRANCH);
  }
});

test.afterAll(async () => {
  if (!skipReason) {
    await toggleBranching(readState().tolgeeUrl, null);
  }
});

test('changes the branch from the compact selector in the branch row', async ({
  page,
  state,
  openPopup,
}, testInfo) => {
  test.skip(Boolean(skipReason), skipReason);

  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);

  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
  const connected = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await connected;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('branch-value')).toHaveText(DEFAULT_BRANCH);

  await popup.getByTestId('change-branch').click();
  const listbox = popup.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option')).toHaveText([
    new RegExp(`^${DEFAULT_BRANCH}`),
    FEATURE_BRANCH,
  ]);
  await popup.screenshot({ path: testInfo.outputPath('branch-editor.png') });

  // The list is laid out inside the popup's own frame, not hanging off its edge.
  const frame = (await popup.getByTestId('connected-panel').boundingBox())!;
  const list = (await listbox.boundingBox())!;
  expect(list.x).toBeGreaterThanOrEqual(frame.x);
  expect(list.x + list.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(list.y + list.height).toBeLessThanOrEqual(frame.y + frame.height);

  await popup.getByTestId('branch-input').fill(FEATURE_BRANCH.slice(0, 3));
  await expect(listbox.getByRole('option')).toHaveText([FEATURE_BRANCH]);

  const switched = page.waitForEvent('load');
  await listbox.getByRole('option', { name: FEATURE_BRANCH }).click();
  await switched;
  await expect(popup.getByTestId('branch-value')).toHaveText(FEATURE_BRANCH);
  expect(await sessionItem(page, '__tolgee_branch')).toBe(FEATURE_BRANCH);

  await popup.getByTestId('change-branch').click();
  await expect(popup.getByRole('listbox')).toBeVisible();
  await popup.getByTestId('branch-input').press('Escape');
  await expect(popup.getByRole('listbox')).toBeHidden();
  await expect(popup.getByTestId('branch-value')).toHaveText(FEATURE_BRANCH);
  expect(await sessionItem(page, '__tolgee_branch')).toBe(FEATURE_BRANCH);

  await popup.getByTestId('change-branch').click();
  await expect(popup.getByRole('listbox')).toBeVisible();
  const switchedBack = page.waitForEvent('load');
  await popup.getByTestId('branch-input').press('ArrowDown');
  await popup.getByTestId('branch-input').press('Enter');
  await switchedBack;
  await expect(popup.getByTestId('branch-value')).toHaveText(DEFAULT_BRANCH);
  expect(await sessionItem(page, '__tolgee_branch')).toBe(DEFAULT_BRANCH);
});
