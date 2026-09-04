import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Link,
  Typography,
} from '@mui/material';

const LEARN_MORE_PROJECT_ID =
  'https://docs.tolgee.io/js-sdk/api/core_package/options#projectid';

type Props = {
  projectDetected: boolean;
  serverOpen: boolean;
  serverField: React.ReactNode;
  serverHost: string;
  serverLink: string;
  serverInvalid: boolean;
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
  serverInvalid,
  connecting,
  connectError,
  onConnect,
  onOpenServerField,
  onUseApiKey,
}: Props) => {
  const useApiKeyButton = (
    <Button
      variant="outlined"
      color="inherit"
      onClick={onUseApiKey}
      data-testid="use-api-key"
    >
      Use an API key instead
    </Button>
  );

  if (!projectDetected) {
    return (
      <>
        <Alert severity="info" data-testid="project-not-detected">
          <AlertTitle>Sign-in not available on this site</AlertTitle>
          To sign in without an API key, the site has to tell the extension
          which Tolgee project it uses. Ask the site&apos;s developer to set
          projectId in the Tolgee configuration.{' '}
          <Link
            href={LEARN_MORE_PROJECT_ID}
            target="_blank"
            rel="noreferrer"
            underline="hover"
          >
            Learn more
          </Link>
        </Alert>
        <Button
          variant="contained"
          color="primary"
          disabled
          data-testid="connect-oauth"
        >
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
          data-testid="server-host"
        >
          {serverHost}
        </Link>{' '}
        and start translating.
      </Typography>
      {serverOpen && (
        <Box display="flex" flexDirection="column" gap={0.5}>
          {serverField}
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary' }}
            data-testid="server-helper"
          >
            Change if you have your own instance of Tolgee.
          </Typography>
        </Box>
      )}
      <Button
        variant="contained"
        color="primary"
        disabled={connecting || serverInvalid}
        onClick={onConnect}
        data-testid="connect-oauth"
      >
        {connecting ? 'Connecting...' : 'Connect to Tolgee'}
      </Button>
      {connectError && (
        <Alert severity="error" data-testid="connect-error">
          {connectError}
        </Alert>
      )}
      {useApiKeyButton}
      {!serverOpen && (
        <Box display="flex" justifyContent="center">
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={onOpenServerField}
            data-testid="change-server"
          >
            Change server
          </Link>
        </Box>
      )}
    </>
  );
};
