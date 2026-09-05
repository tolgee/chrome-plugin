import { BranchOption } from './popupState';
import { credentialFetch } from './proxyFetch';
import { Values } from './tools';

export const fetchBranches = async (
  projectId: number,
  values: Values
): Promise<BranchOption[] | null> => {
  const r = await credentialFetch(
    values,
    `/v2/projects/${projectId}/branches?size=100`
  );
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
