import { hostOf } from './url';

export const PROJECT_INACCESSIBLE = 'project_inaccessible';

/** The worker's typed answer to OAUTH_LOGIN when the granted token cannot reach the page's declared project. */
export type ConnectRefusal = {
  code: typeof PROJECT_INACCESSIBLE;
  projectId: number;
  apiUrl: string;
};

export class ProjectInaccessibleError extends Error {
  readonly code = PROJECT_INACCESSIBLE;

  constructor(
    readonly projectId: number,
    readonly apiUrl: string
  ) {
    super(
      `This account can't access project #${projectId} on ${hostOf(apiUrl)}`
    );
    this.name = 'ProjectInaccessibleError';
  }
}

export const connectRefusalOf = (e: unknown): ConnectRefusal | undefined =>
  e instanceof ProjectInaccessibleError
    ? { code: e.code, projectId: e.projectId, apiUrl: e.apiUrl }
    : undefined;

export const isProjectInaccessibleRefusal = (
  response: unknown
): response is ConnectRefusal => {
  const candidate = response as Partial<ConnectRefusal> | null | undefined;
  return (
    candidate?.code === PROJECT_INACCESSIBLE &&
    typeof candidate.projectId === 'number' &&
    typeof candidate.apiUrl === 'string'
  );
};
