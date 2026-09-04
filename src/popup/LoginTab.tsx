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
  onUseApiKey: () => void;
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
  onUseApiKey,
}: Props) => {
  const useApiKeyButton = (
    <Button variant="outlined" color="inherit" onClick={onUseApiKey}>
      Use an API key instead
    </Button>
  );

  if (!projectDetected) {
    return (
      <>
        <Box>
          <Typography variant="body2" fontWeight={500}>
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
        </Box>
        <Button variant="contained" color="primary" disabled>
          Connect to Tolgee
        </Button>
        {useApiKeyButton}
      </>
    );
  }
  return (
    <>
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
      {serverOpen && (
        <Box display="flex" flexDirection="column" gap={0.5}>
          {serverField}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Change if you have your own instance of Tolgee.
          </Typography>
        </Box>
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
      {useApiKeyButton}
      {!serverOpen && (
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
    </>
  );
};
