import { Alert, AlertTitle, Box, Link } from '@mui/material';

import { SdkTooOldAlert } from './SdkTooOldAlert';
import { BranchRow, BranchState } from './BranchRow';
import { EditingSwitch } from './EditingSwitch';
import { PopupFrame } from './PopupFrame';
import { AccountCard, ConnectionSummary } from './AccountCard';
import { ConnectedFooter } from './ConnectedFooter';
import {
  KeyRejected,
  ProjectInaccessible,
  SessionEnded,
} from './ConnectedErrors';
import {
  connectionTitle,
  hasEditingSwitch,
  Session,
} from './connectionSummary';
import { Label, Value } from './fields';

type Props = {
  session: Session;
  serverHost: string;
  // The server rejected the session or key outright (a 401 / an unknown key), not an outage.
  credentialRejected: boolean;
  projectName: string | null;
  projectUrl: string | null;
  projectInaccessible: boolean;
  declaredProjectId: number | undefined;
  sdkTooOld: boolean;
  // The key's project is not known yet, so there is nothing to switch editing on with.
  checkingKey: boolean;
  branch: BranchState | null;
  editingOn: boolean;
  onToggleEditing: () => void;
  onChangeBranch: (branch: string) => void;
  onSignOut: () => void;
  onSignInAgain: () => void;
  onUseAnotherKey: () => void;
};

export const ConnectedPanel = ({
  session,
  serverHost,
  credentialRejected,
  projectName,
  projectUrl,
  projectInaccessible,
  declaredProjectId,
  sdkTooOld,
  checkingKey,
  branch,
  editingOn,
  onToggleEditing,
  onChangeBranch,
  onSignOut,
  onSignInAgain,
  onUseAnotherKey,
}: Props) => {
  const isOauth = session.kind === 'oauth';
  const siteKey = session.kind === 'apiKey' && session.source === 'site';
  const title = connectionTitle(session);
  const footerProps = { session, onSignOut, onUseAnotherKey };

  if (isOauth && credentialRejected) {
    return (
      <SessionEnded
        session={session}
        serverHost={serverHost}
        onSignInAgain={onSignInAgain}
      />
    );
  }
  if (isOauth && projectInaccessible) {
    return (
      <ProjectInaccessible
        {...footerProps}
        serverHost={serverHost}
        declaredProjectId={declaredProjectId}
      />
    );
  }
  if (!isOauth && credentialRejected) {
    return <KeyRejected {...footerProps} serverHost={serverHost} />;
  }

  return (
    <PopupFrame title={title} testId="connected-panel">
      <ConnectionSummary session={session} projectName={projectName} />
      <AccountCard session={session} serverHost={serverHost} />

      {sdkTooOld && <SdkTooOldAlert />}

      <Box
        display="grid"
        gridTemplateColumns="max-content 1fr"
        columnGap={1.5}
        rowGap={1}
        alignItems="center"
      >
        {projectName && (
          <>
            <Label>Project</Label>
            <Value>
              {projectUrl ? (
                <Link
                  href={projectUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="project-link"
                >
                  {projectName}
                </Link>
              ) : (
                <span data-testid="project-name">{projectName}</span>
              )}
            </Value>
          </>
        )}
        {branch && (
          <BranchRow
            branch={branch}
            canOverride={!siteKey}
            editingOn={editingOn}
            onChangeBranch={onChangeBranch}
          />
        )}
      </Box>

      {siteKey && (
        <Alert severity="info" data-testid="dev-mode-note">
          <AlertTitle>Development setup</AlertTitle>
          Anyone who opens this site can use its API key. Keep this for
          development only.
        </Alert>
      )}
      {hasEditingSwitch(session) && (
        <EditingSwitch
          editingOn={editingOn}
          disabled={sdkTooOld || checkingKey}
          checkingKey={checkingKey}
          branchOverride={branch?.override}
          onToggle={onToggleEditing}
        />
      )}

      <ConnectedFooter {...footerProps} />
    </PopupFrame>
  );
};
