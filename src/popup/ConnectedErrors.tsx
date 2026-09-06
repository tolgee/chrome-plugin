import React from 'react';
import { Alert, AlertTitle, Button } from '@mui/material';
import { AccountCard } from './AccountCard';
import { ApiKeyRejectedAlert } from './ApiKeyRejectedAlert';
import { ConnectedFooter } from './ConnectedFooter';
import { PopupFrame } from './PopupFrame';
import { connectionTitle, Session } from './sessionCopy';

const Frame = ({
  session,
  serverHost,
  children,
}: {
  session: Session;
  serverHost: string;
  children: React.ReactNode;
}) => (
  <PopupFrame title={connectionTitle(session)} testId="connected-panel">
    <AccountCard session={session} serverHost={serverHost} />
    {children}
  </PopupFrame>
);

export const SessionEnded = ({
  session,
  serverHost,
  onSignInAgain,
}: {
  session: Session;
  serverHost: string;
  onSignInAgain: () => void;
}) => (
  <Frame session={session} serverHost={serverHost}>
    <Alert severity="info" data-testid="session-ended">
      <AlertTitle>Your session ended</AlertTitle>
      It expired or was revoked on the server. Sign in again to keep editing.
    </Alert>
    <Button
      variant="contained"
      color="primary"
      onClick={onSignInAgain}
      data-testid="sign-in-again"
    >
      Sign in again
    </Button>
  </Frame>
);

export const ProjectInaccessible = ({
  session,
  serverHost,
  declaredProjectId,
  onSignOut,
  onUseAnotherKey,
}: {
  session: Session;
  serverHost: string;
  declaredProjectId: number | undefined;
  onSignOut: () => void;
  onUseAnotherKey: () => void;
}) => (
  <Frame session={session} serverHost={serverHost}>
    <Alert severity="warning" data-testid="project-inaccessible">
      <AlertTitle>No access to this page&apos;s project</AlertTitle>
      This site requests a project this session can&apos;t reach on {serverHost}
      . Either you don&apos;t have access to it, or a different project was
      chosen while signing in. Sign out and sign in again to pick the right one.
    </Alert>
    <ConnectedFooter
      session={session}
      note={
        declaredProjectId === undefined
          ? undefined
          : `Project #${declaredProjectId} on ${serverHost}`
      }
      onSignOut={onSignOut}
      onUseAnotherKey={onUseAnotherKey}
    />
  </Frame>
);

export const KeyRejected = ({
  session,
  serverHost,
  onSignOut,
  onUseAnotherKey,
}: {
  session: Session;
  serverHost: string;
  onSignOut: () => void;
  onUseAnotherKey: () => void;
}) => (
  <Frame session={session} serverHost={serverHost}>
    <ApiKeyRejectedAlert serverHost={serverHost} testId="api-key-rejected" />
    <ConnectedFooter
      session={session}
      onSignOut={onSignOut}
      onUseAnotherKey={onUseAnotherKey}
    />
  </Frame>
);
