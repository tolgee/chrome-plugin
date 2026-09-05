import React from 'react';
import { Box, Button, FormControl, Link, Typography } from '@mui/material';

import { ApiKeyCheck, isApiKeyValid } from './apiKeyCheck';
import { connectButtonLabel } from './apiKeyScreen';
import { ApiKeyField } from './ApiKeyField';
import { ApiKeyCheckAlerts, ApiKeyHelper } from './ApiKeyCheckAlerts';

type Props = {
  serverHost: string;
  serverLink: string;
  apiKey: string;
  onChangeApiKey: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  apiKeyCheck: ApiKeyCheck;
  canApply: boolean;
  onApply: () => void;
  onBack: () => void;
};

export const ApiKeyTab = ({
  serverHost,
  serverLink,
  apiKey,
  onChangeApiKey,
  onKeyDown,
  apiKeyCheck,
  canApply,
  onApply,
  onBack,
}: Props) => (
  <>
    <Typography variant="body2">
      Connect to{' '}
      <Link
        href={serverLink}
        target="_blank"
        rel="noreferrer"
        underline="hover"
        data-testid="server-host"
      >
        {serverHost}
      </Link>{' '}
      with a project API key and start editing.
    </Typography>
    <FormControl fullWidth>
      <ApiKeyField
        apiKey={apiKey}
        verified={isApiKeyValid(apiKeyCheck)}
        invalid={apiKeyCheck === 'invalid'}
        onChange={onChangeApiKey}
        onKeyDown={onKeyDown}
      />
      <ApiKeyHelper apiKeyCheck={apiKeyCheck} serverHost={serverHost} />
    </FormControl>
    <ApiKeyCheckAlerts apiKeyCheck={apiKeyCheck} serverHost={serverHost} />
    <Button
      variant="contained"
      color="primary"
      onClick={onApply}
      disabled={!canApply}
      data-testid="connect-with-api-key"
    >
      {connectButtonLabel(apiKeyCheck)}
    </Button>
    <Box display="flex" justifyContent="center">
      <Link
        component="button"
        type="button"
        underline="hover"
        variant="body2"
        onClick={onBack}
        data-testid="all-connection-options"
      >
        All connection options
      </Link>
    </Box>
  </>
);
