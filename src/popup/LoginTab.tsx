import React from 'react';
import { Alert, Box, Button, Link, Typography } from '@mui/material';

const LEARN_MORE_PROJECT_ID =
  'https://docs.tolgee.io/js-sdk/api/core_package/options#projectid';

type Props = {
  projectDetected: boolean;
  serverOpen: boolean;
  serverField: React.ReactNode;
  serverHost: string;
  serverLink: string;
  connecting: boolean;
  connectError: string | null;
  onConnect: () => void;
  onOpenServerField: () => void;
};

export const LoginTab = ({
  projectDetected,
  serverOpen,
  serverField,
  serverHost,
  serverLink,
  connecting,
  connectError,
  onConnect,
  onOpenServerField,
}: Props) => {
  if (!projectDetected) {
    return (
      <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
        <Typography variant="body2" fontWeight="bold">
          Project not detected
        </Typography>
        <Typography variant="body2">
          Ask the website administrator to add projectId to the Tolgee
          configuration.{' '}
          <Link
            href={LEARN_MORE_PROJECT_ID}
            target="_blank"
            rel="noreferrer"
            underline="hover"
          >
            Learn more
          </Link>
        </Typography>
        <Button variant="contained" color="primary" disabled>
          Connect to Tolgee
        </Button>
      </Box>
    );
  }
  return (
    <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
      {serverOpen ? (
        serverField
      ) : (
        <Typography variant="body2">
          Connect to your account on{' '}
          <Link
            href={serverLink}
            target="_blank"
            rel="noreferrer"
            underline="hover"
          >
            {serverHost}
          </Link>{' '}
          and start translating.
        </Typography>
      )}
      <Button
        variant="contained"
        color="primary"
        disabled={connecting}
        onClick={onConnect}
      >
        {connecting ? 'Connecting...' : 'Connect to Tolgee'}
      </Button>
      {connectError && <Alert severity="error">{connectError}</Alert>}
      {serverOpen ? (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Change if you have your own instance of Tolgee.
        </Typography>
      ) : (
        <Box display="flex" justifyContent="center">
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={onOpenServerField}
          >
            Change server
          </Link>
        </Box>
      )}
    </Box>
  );
};
