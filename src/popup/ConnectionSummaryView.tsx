import { Typography } from '@mui/material';
import { connectionHow, isViewOnly, Session } from './connectionSummary';

export const ConnectionSummary = ({
  session,
  projectName,
}: {
  session: Session;
  projectName: string | null;
}) => (
  <Typography variant="body2" data-testid="connection-summary">
    {connectionHow(session)}{' '}
    {isViewOnly(session) ? (
      'You can look up strings on this page but not edit them.'
    ) : (
      <>
        Edits you make on this page are saved{' '}
        {projectName ? (
          <>
            to <b>{projectName}</b>{' '}
          </>
        ) : null}
        in Tolgee.
      </>
    )}
  </Typography>
);
