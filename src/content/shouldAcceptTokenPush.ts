import { scopeServesProject } from '../oauth/tokenScope';
import { sameOrigin } from '../oauth/url';

export const shouldAcceptTokenPush = (args: {
  authToken?: string | null;
  projectKey?: string;
  pageProjectId: string | null;
  pageApiUrl: string | null;
  pushApiUrl?: string | null;
}): boolean =>
  Boolean(args.authToken) &&
  scopeServesProject(args.projectKey, args.pageProjectId) &&
  sameOrigin(args.pageApiUrl, args.pushApiUrl);
