import { log } from './env';

// Any user created by the platform's e2e test-data builders, and the docker image's initial admin, get this password.
const PASSWORD = 'admin';
const ADMIN = 'admin';
// Its generate-standard creates one user with one project: see OAuth2ConsentE2eData on the platform.
const INTERNAL_RESOURCE = 'oauth2-consent';

export const API_KEY_SCOPES = [
  'translations.view',
  'translations.edit',
  'keys.view',
  'keys.edit',
  'screenshots.view',
  'screenshots.upload',
  'screenshots.delete',
];

export type SeedMode = 'internal' | 'public';
export type User = { username: string; password: string };
export type Project = { id: number; name: string };

export type SeedCleanup = {
  mode: SeedMode;
  user: User;
  createdProjectIds: number[];
};

export type Seeded = {
  mode: SeedMode;
  user: User;
  projects: Project[];
  apiKey: string;
  cleanup: SeedCleanup;
};

const isHtml = (res: Response) =>
  (res.headers.get('content-type') ?? '').includes('text/html');

export class TolgeeApi {
  private token: string | undefined;

  constructor(private readonly baseUrl: string) {}

  async internalControllersEnabled(): Promise<boolean> {
    const res = await this.fetchInternal(`${INTERNAL_RESOURCE}/clean`);
    return res.ok && !isHtml(res);
  }

  async internal(path: string): Promise<any> {
    const res = await this.fetchInternal(path);
    if (!res.ok || isHtml(res)) {
      throw new Error(`internal ${path} failed: HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // A dev server in front of the API (vite) answers unknown paths with the SPA's index.html, but only to requests
  // that accept HTML.
  private fetchInternal(path: string) {
    return fetch(`${this.baseUrl}/internal/e2e-data/${path}`, {
      headers: { Accept: 'application/json' },
    });
  }

  async login(user: User) {
    const res = await fetch(`${this.baseUrl}/api/public/generatetoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!res.ok) {
      throw new Error(`login as ${user.username} failed: HTTP ${res.status}`);
    }
    this.token = (await res.json()).accessToken;
  }

  async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}/v2/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `${method} /v2/${path} failed: HTTP ${res.status} ${await res.text()}`
      );
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async defaultOrganizationId(): Promise<number> {
    const organizations = (await this.request('GET', 'organizations'))._embedded
      ?.organizations;
    if (!organizations?.length) {
      throw new Error('the seeding user has no organization');
    }
    return organizations[0].id;
  }

  async createProject(
    name: string,
    options: { useBranching?: boolean } = {}
  ): Promise<Project> {
    const project = await this.request('POST', 'projects', {
      name,
      organizationId: await this.defaultOrganizationId(),
      languages: [{ name: 'English', originalName: 'English', tag: 'en' }],
      baseLanguageTag: 'en',
      icuPlaceholders: true,
      ...options,
    });
    return { id: project.id, name: project.name };
  }

  // The testapp's title key, so the page shows a real translation instead of the key name once it is connected.
  importKeys(projectId: number) {
    return this.request('POST', `projects/${projectId}/keys/import`, {
      keys: [{ name: 'app-title', translations: { en: 'What To Pack' } }],
    });
  }

  async createApiKey(projectId: number): Promise<string> {
    return (await this.createApiKeyWithId(projectId)).key;
  }

  async createApiKeyWithId(
    projectId: number,
    scopes: string[] = API_KEY_SCOPES
  ): Promise<{ id: number; key: string }> {
    const created = await this.request('POST', 'api-keys', {
      projectId,
      scopes,
      description: 'browser extension e2e',
    });
    return { id: created.id, key: created.key };
  }

  updateApiKeyScopes(id: number, scopes: string[]) {
    return this.request('PUT', `api-keys/${id}`, {
      scopes,
      description: 'browser extension e2e',
    });
  }

  deleteApiKey(id: number) {
    return this.request('DELETE', `api-keys/${id}`);
  }

  async findKeyId(projectId: number, keyName: string): Promise<number | null> {
    const data = await this.request(
      'GET',
      `projects/${projectId}/translations?filterKeyName=${encodeURIComponent(
        keyName
      )}`
    );
    return data._embedded?.keys?.[0]?.keyId ?? null;
  }

  async keyScreenshots(
    projectId: number,
    keyId: number
  ): Promise<{ id: number; keyReferences: { keyId: number }[] }[]> {
    const data = await this.request(
      'GET',
      `projects/${projectId}/keys/${keyId}/screenshots`
    );
    return data._embedded?.screenshots ?? [];
  }

  deleteKeyScreenshots(projectId: number, keyId: number, ids: number[]) {
    return this.request(
      'DELETE',
      `projects/${projectId}/keys/${keyId}/screenshots/${ids.join(',')}`
    );
  }

  currentUser(): Promise<{ id: number; name: string; username: string }> {
    return this.request('GET', 'user');
  }

  deleteProject(id: number) {
    return this.request('DELETE', `projects/${id}`);
  }
}

/**
 * Prepares one user owning `projectCount` projects, plus an API key for the first project.
 *
 * With the platform's internal e2e-data controllers enabled (`tolgee.internal.controllerEnabled`, as in the docker
 * setup) the user and the first project come from the `oauth2-consent` test data; otherwise (e.g. a dev-profile
 * backend behind TOLGEE_URL, where the controllers are not reachable) everything is created through the public API as
 * `admin`. Extra projects and the API key always go through the public API as that user.
 */
export const seed = async (
  tolgeeUrl: string,
  projectCount: number
): Promise<Seeded> => {
  const api = new TolgeeApi(tolgeeUrl);
  const mode: SeedMode = (await api.internalControllersEnabled())
    ? 'internal'
    : 'public';
  log(`seeding through the ${mode} API`);

  const projects: Project[] = [];
  let user: User;
  if (mode === 'internal') {
    await api.internal(`${INTERNAL_RESOURCE}/clean`);
    const generated = await api.internal(
      `${INTERNAL_RESOURCE}/generate-standard`
    );
    user = { username: generated.users[0].username, password: PASSWORD };
    projects.push(generated.projects[0]);
  } else {
    user = { username: ADMIN, password: PASSWORD };
  }
  const cleanup: SeedCleanup = { mode, user, createdProjectIds: [] };

  try {
    await api.login(user);
    const stamp = Date.now();
    while (projects.length < projectCount) {
      const project = await api.createProject(
        `Extension e2e ${projects.length + 1} ${stamp}`
      );
      projects.push(project);
      cleanup.createdProjectIds.push(project.id);
    }
    for (const project of projects) {
      await api
        .importKeys(project.id)
        .catch((e) =>
          console.warn(`[e2e] key import into project ${project.id} failed`, e)
        );
    }
    const apiKey = await api.createApiKey(projects[0].id);
    log(
      `seeded user ${user.username} with projects ${projects
        .map((p) => `${p.id} "${p.name}"`)
        .join(', ')}`
    );
    return { mode, user, projects, apiKey, cleanup };
  } catch (e) {
    await cleanupSeed(tolgeeUrl, cleanup).catch((cleanupError) =>
      console.warn('[e2e] cleanup after a failed seed failed', cleanupError)
    );
    throw e;
  }
};

export const cleanupSeed = async (tolgeeUrl: string, cleanup: SeedCleanup) => {
  const api = new TolgeeApi(tolgeeUrl);
  await api.login(cleanup.user);
  for (const id of cleanup.createdProjectIds) {
    await api
      .deleteProject(id)
      .catch((e) => console.warn(`[e2e] could not delete project ${id}`, e));
  }
  if (cleanup.mode === 'internal') {
    await api.internal(`${INTERNAL_RESOURCE}/clean`);
  }
};
