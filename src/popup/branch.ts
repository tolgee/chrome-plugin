import { normalizeUrl } from '../oauth/url';
import { BranchOption } from './reducer';
import { isOAuth, Values } from './tools';

export const credentialHeaders = (values: Values): Record<string, string> =>
  isOAuth(values)
    ? { Authorization: `Bearer ${values.authToken}` }
    : { 'X-API-Key': values.apiKey ?? '' };

export const fetchBranches = async (
  projectId: number,
  values: Values
): Promise<BranchOption[] | null> => {
  const url = normalizeUrl(values.apiUrl ?? '');
  const r = await fetch(`${url}/v2/projects/${projectId}/branches?size=100`, {
    headers: credentialHeaders(values),
  });
  if (!r.ok) {
    throw new Error('Failed to load branches');
  }
  const data = await r.json();
  return (
    data?._embedded?.branches?.map((b: any) => ({
      name: b.name,
      isDefault: b.isDefault,
    })) ?? null
  );
};

// The name the page itself works on when the popup sets no override.
export const pageBranchLabel = (
  pageBranch: string | undefined,
  branches: BranchOption[] | null
): string =>
  pageBranch || branches?.find((b) => b.isDefault)?.name || 'Default branch';

export const branchInEffect = (
  override: string | undefined,
  pageBranch: string | undefined,
  branches: BranchOption[] | null
): string => override || pageBranchLabel(pageBranch, branches);

export type BranchEditorKeyAction = 'commit' | 'cancel' | null;

// With an option highlighted, the Autocomplete selects it on Enter itself (onChange); committing the typed text
// here as well would apply the wrong branch first.
export const branchEditorKeyAction = (
  key: string,
  optionHighlighted: boolean
): BranchEditorKeyAction => {
  if (key === 'Escape') {
    return 'cancel';
  }
  if (key === 'Enter' && !optionHighlighted) {
    return 'commit';
  }
  return null;
};

export const abbreviateApiKey = (key: string): string =>
  key.length <= 16 ? key : `${key.slice(0, 10)}…${key.slice(-5)}`;
