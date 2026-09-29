import { useState } from 'react';
import { Alert, AlertTitle, Box, Button, Collapse } from '@mui/material';
import { ExpandMoreIcon } from './icons';
import { scopeLabel } from './scopeLabels';

const LIST_ID = 'missing-permissions-list';

export const MissingPermissionsAlert = ({
  missing,
  signingInAgain,
  onReauthorize,
  onDismiss,
}: {
  missing: string[];
  signingInAgain: boolean;
  onReauthorize: () => void;
  onDismiss: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Alert
      severity="info"
      data-testid="missing-permissions"
      onClose={onDismiss}
    >
      <AlertTitle>The Tolgee plugin is missing some permissions</AlertTitle>
      Sign in again to grant them.
      <Box mt={0.5}>
        <Button
          color="inherit"
          size="small"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={LIST_ID}
          data-testid="missing-permissions-toggle"
          startIcon={
            <ExpandMoreIcon
              fontSize="small"
              sx={(theme) => ({
                transition: theme.transitions.create('transform', {
                  duration: theme.transitions.duration.shorter,
                }),
                transform: expanded ? 'rotate(180deg)' : 'none',
              })}
            />
          }
          sx={{ ml: -0.5, textTransform: 'none' }}
        >
          {missing.length === 1
            ? '1 missing permission'
            : `${missing.length} missing permissions`}
        </Button>
      </Box>
      <Collapse in={expanded}>
        <Box component="ul" id={LIST_ID} sx={{ my: 0.5, pl: 2.5 }}>
          {missing.map((scope) => (
            <li key={scope} data-testid="missing-permission" data-scope={scope}>
              {scopeLabel(scope)}
            </li>
          ))}
        </Box>
      </Collapse>
      <Box mt={1}>
        <Button
          color="inherit"
          size="small"
          variant="outlined"
          disabled={signingInAgain}
          onClick={onReauthorize}
          data-testid="sign-in-again-for-permissions"
        >
          Sign in again
        </Button>
      </Box>
    </Alert>
  );
};
