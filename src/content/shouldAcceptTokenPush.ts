import { servesSameProject } from '../oauth/sessionRules';
import { sameOrigin } from '../oauth/url';

export const shouldAcceptTokenPush = (args: {
  authToken?: string | null;
  projectKey?: string;
  pageProjectKey: string | null;
  pageApiUrl: string | null;
  pushApiUrl?: string | null;
}): boolean =>
  Boolean(args.authToken) &&
  args.projectKey !== undefined &&
  servesSameProject(args.projectKey, args.pageProjectKey) &&
  sameOrigin(args.pageApiUrl, args.pushApiUrl);
