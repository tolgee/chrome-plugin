import { useState } from 'react';
import { Box, IconButton } from '@mui/material';
import { BranchOption } from './popupState';
import { branchInEffect, pageBranchLabel } from './branch';
import { BRANCH_EDITOR_LIST_SPACE, BranchEditor } from './BranchEditor';
import { EditIcon } from './icons';
import { Label, Value } from './fields';

export type BranchState = {
  override: string | undefined;
  pageBranch: string | undefined;
  options: BranchOption[] | null;
};

export const BranchRow = ({
  branch,
  canOverride,
  editingOn,
  onChangeBranch,
}: {
  branch: BranchState;
  canOverride: boolean;
  editingOn: boolean;
  onChangeBranch: (branch: string) => void;
}) => {
  const [editingBranch, setEditingBranch] = useState(false);
  return (
    <>
      <Label>Branch</Label>
      {editingBranch ? (
        <>
          <BranchEditor
            value={branch.override ?? ''}
            options={branch.options ?? []}
            placeholder={pageBranchLabel(branch.pageBranch, branch.options)}
            onCommit={(next) => {
              setEditingBranch(false);
              if (next !== (branch.override ?? '')) {
                onChangeBranch(next);
              }
            }}
            onCancel={() => setEditingBranch(false)}
          />
          <Box gridColumn="1 / -1" height={BRANCH_EDITOR_LIST_SPACE} />
        </>
      ) : (
        <Box display="flex" alignItems="center" gap={0.5} minWidth={0}>
          <Value>
            <span data-testid="branch-value">
              {branchInEffect(
                branch.override,
                branch.pageBranch,
                branch.options
              )}
            </span>
          </Value>
          {canOverride && (
            <IconButton
              size="small"
              title="Change branch"
              aria-label="Change branch"
              disabled={!editingOn}
              onClick={() => setEditingBranch(true)}
              data-testid="change-branch"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}
    </>
  );
};
