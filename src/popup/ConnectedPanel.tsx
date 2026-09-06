import { Alert, AlertTitle, Box, Link } from '@mui/material';

import { SdkTooOldAlert } from './SdkTooOldAlert';
import { BranchRow, BranchState } from './BranchRow';
import { EditingSwitch } from './EditingSwitch';
import { PopupFrame } from './PopupFrame';
import { AccountCard } from './AccountCard';
import { ConnectionSummary } from './ConnectionSummary';
import { ConnectedFooter } from './ConnectedFooter';
import {
  KeyRejected,
  ProjectInaccessible,
  SessionEnded,
} from './ConnectedErrors';
import { connectionTitle, hasEditingSwitch, Session } from './sessionCopy';
import { Label, Value } from './fields';

type Props = {
  session: Session;
  serverHost: string;
  credentialsCheckInvalid: boolean;
  projectName: string | null;
  projectUrl: string | null;
  projectInaccessible: boolean;
  declaredProjectId: number | undefined;
  sdkTooOld: boolean;
  keyProjectPending: boolean;
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
  credentialsCheckInvalid,
  projectName,
  projectUrl,
  projectInaccessible,
  declaredProjectId,
  sdkTooOld,
  keyProjectPending,
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

  if (isOauth && credentialsCheckInvalid) {
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
  if (!isOauth && credentialsCheckInvalid) {
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
          disabled={sdkTooOld || keyProjectPending}
          keyProjectPending={keyProjectPending}
          branchOverride={branch?.override}
          onToggle={onToggleEditing}
        />
      )}

      <ConnectedFooter {...footerProps} />
    </PopupFrame>
  );
};
