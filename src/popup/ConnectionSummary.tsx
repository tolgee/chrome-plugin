import { Typography } from '@mui/material';
import {
  connectionHow,
  isViewOnly,
  Session,
  VIEW_ONLY_NOTE,
} from './sessionCopy';

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
      VIEW_ONLY_NOTE
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
