import React, { useState } from 'react';
import {
  Alert,
  AlertTitle,
  alpha,
  Box,
  Button,
  IconButton,
  Link,
  Paper,
  Switch,
  Typography,
} from '@mui/material';

import { BranchOption } from './reducer';
import { abbreviateApiKey, branchInEffect, pageBranchLabel } from './branch';
import { BranchEditor } from './BranchEditor';
import { EditIcon } from './icons';
import { PopupFrame } from './PopupFrame';

export type Session =
  | { kind: 'oauth'; userFullName: string | null }
  | { kind: 'apiKey'; apiKey: string };

type BranchState = {
  override: string | undefined;
  pageBranch: string | undefined;
  options: BranchOption[] | null;
};

type Props = {
  session: Session;
  serverHost: string;
  sessionEnded: boolean;
  apiKeyRejected: boolean;
  projectName: string | null;
  projectUrl: string | null;
  projectInaccessible: boolean;
  declaredProjectId: number | undefined;
  branch: BranchState | null;
  editingOn: boolean;
  onToggleEditing: () => void;
  onChangeBranch: (branch: string) => void;
  onSignOut: () => void;
  onSignInAgain: () => void;
};

const AccountCard = ({
  session,
  serverHost,
}: {
  session: Session;
  serverHost: string;
}) => {
  const name =
    session.kind === 'oauth'
      ? session.userFullName || 'Tolgee account'
      : 'Project API key';
  const detail =
    session.kind === 'oauth'
      ? `Signed in on ${serverHost}`
      : `${abbreviateApiKey(session.apiKey)} on ${serverHost}`;
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        py: 1.25,
      }}
    >
      <Box minWidth={0}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {detail}
        </Typography>
      </Box>
    </Paper>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" color="text.secondary">
    {children}
  </Typography>
);

const Value = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" fontWeight={500} noWrap minWidth={0}>
    {children}
  </Typography>
);

const Footer = ({
  note,
  action,
  onAction,
}: {
  note?: string;
  action: string;
  onAction: () => void;
}) => (
  <Box
    display="flex"
    justifyContent={note ? 'space-between' : 'flex-end'}
    alignItems="center"
  >
    {note && (
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    )}
    <Button size="small" color="error" onClick={onAction}>
      {action}
    </Button>
  </Box>
);

export const ConnectedPanel = ({
  session,
  serverHost,
  sessionEnded,
  apiKeyRejected,
  projectName,
  projectUrl,
  projectInaccessible,
  declaredProjectId,
  branch,
  editingOn,
  onToggleEditing,
  onChangeBranch,
  onSignOut,
  onSignInAgain,
}: Props) => {
  const [editingBranch, setEditingBranch] = useState(false);

  const isOauth = session.kind === 'oauth';
  const title = isOauth ? 'Tolgee plugin' : 'API key connection';
  const footerAction = isOauth ? 'Sign out' : 'Remove key';
  const footer = <Footer action={footerAction} onAction={onSignOut} />;

  if (isOauth && sessionEnded) {
    return (
      <PopupFrame title={title}>
        <AccountCard session={session} serverHost={serverHost} />
        <Alert severity="info">
          <AlertTitle>Your session ended</AlertTitle>
          It expired or was revoked on the server. Sign in again to keep
          editing.
        </Alert>
        <Button variant="contained" color="primary" onClick={onSignInAgain}>
          Sign in again
        </Button>
      </PopupFrame>
    );
  }

  if (isOauth && projectInaccessible) {
    return (
      <PopupFrame title={title}>
        <AccountCard session={session} serverHost={serverHost} />
        <Alert severity="warning">
          <AlertTitle>No access to this page&apos;s project</AlertTitle>
          This site requests a project this session can&apos;t reach on{' '}
          {serverHost}. Either you don&apos;t have access to it, or a different
          project was chosen while signing in. Sign out and sign in again to
          pick the right one.
        </Alert>
        <Footer
          note={
            declaredProjectId === undefined
              ? undefined
              : `Project #${declaredProjectId} on ${serverHost}`
          }
          action={footerAction}
          onAction={onSignOut}
        />
      </PopupFrame>
    );
  }

  if (!isOauth && apiKeyRejected) {
    return (
      <PopupFrame title={title}>
        <AccountCard session={session} serverHost={serverHost} />
        <Alert severity="error">
          <AlertTitle>
            This API key doesn&apos;t work on {serverHost}
          </AlertTitle>
          Check for a typo, or that the key belongs to this server and
          hasn&apos;t been revoked.
        </Alert>
        {footer}
      </PopupFrame>
    );
  }

  const overrideSet = Boolean(branch?.override);
  const editingHint = !editingOn
    ? 'You stay signed in. Turn it on to edit here.'
    : overrideSet
      ? `Edits go to ${branch!.override}.`
      : 'Alt+click any text on the page to edit it.';

  return (
    <PopupFrame title={title}>
      <AccountCard session={session} serverHost={serverHost} />

      <Box
        display="grid"
        gridTemplateColumns="76px 1fr"
        columnGap={1.5}
        rowGap={1}
        alignItems="center"
      >
        {projectName && (
          <>
            <Label>Project</Label>
            <Value>
              {projectUrl ? (
                <Link href={projectUrl} target="_blank" rel="noreferrer">
                  {projectName}
                </Link>
              ) : (
                projectName
              )}
            </Value>
          </>
        )}
        {branch && !editingBranch && (
          <>
            <Label>Branch</Label>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={1}
              minWidth={0}
            >
              <Value>
                {branchInEffect(
                  branch.override,
                  branch.pageBranch,
                  branch.options
                )}
              </Value>
              <IconButton
                size="small"
                title="Change branch"
                aria-label="Change branch"
                disabled={!editingOn}
                onClick={() => setEditingBranch(true)}
                sx={{ mr: -0.75 }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Box>
            {overrideSet && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ gridColumn: '1 / -1' }}
              >
                Page uses{' '}
                <Box component="b" sx={{ fontWeight: 500 }}>
                  {pageBranchLabel(branch.pageBranch, branch.options)}
                </Box>
                .
                {editingOn && (
                  <>
                    {' '}
                    <Link
                      component="button"
                      type="button"
                      underline="hover"
                      variant="caption"
                      onClick={() => onChangeBranch('')}
                    >
                      Reset
                    </Link>
                  </>
                )}
              </Typography>
            )}
          </>
        )}
      </Box>

      {branch && editingBranch && (
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
      )}

      <Box
        display="flex"
        alignItems="center"
        gap={1.5}
        px={1.5}
        py={1.25}
        borderRadius={1.5}
        sx={{
          bgcolor: (theme) =>
            editingOn
              ? alpha(theme.palette.primary.main, 0.12)
              : theme.palette.action.hover,
        }}
      >
        <Switch
          size="small"
          checked={editingOn}
          onChange={onToggleEditing}
          color="primary"
        />
        <Box minWidth={0}>
          <Typography variant="body2" fontWeight={500}>
            {editingOn
              ? 'In-context editing on this page'
              : 'In-context editing off on this page'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {editingHint}
          </Typography>
        </Box>
      </Box>

      {footer}
    </PopupFrame>
  );
};
