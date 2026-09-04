import React from 'react';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  Link,
  TextField,
  Typography,
} from '@mui/material';

import { ApiKeyCheck } from './useApiKeyCheck';

const API_KEY_HELP =
  'https://docs.tolgee.io/platform/account_settings/api_keys_and_pat_tokens';

type Props = {
  serverField: React.ReactNode;
  apiKey: string;
  onChangeApiKey: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  apiKeyCheck: ApiKeyCheck;
  canApply: boolean;
  onApply: () => void;
  isInDevelopmentMode: boolean;
};

export const ApiKeyTab = ({
  serverField,
  apiKey,
  onChangeApiKey,
  onKeyDown,
  apiKeyCheck,
  canApply,
  onApply,
  isInDevelopmentMode,
}: Props) => (
  <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
    {serverField}
    <FormControl fullWidth>
      <TextField
        label="API key"
        variant="outlined"
        value={apiKey}
        onChange={(e) => onChangeApiKey(e.target.value)}
        onKeyDown={onKeyDown}
        size="small"
      />
      <FormHelperText
        error={apiKeyCheck === 'invalid' || apiKeyCheck === 'unreachable'}
        style={{ minHeight: 15 }}
        sx={{ marginLeft: 0 }}
      >
        {apiKeyCheck === null ? (
          ''
        ) : apiKeyCheck === 'loading' ? (
          '...'
        ) : apiKeyCheck === 'invalid' ? (
          'Invalid API key for this server'
        ) : apiKeyCheck === 'unreachable' ? (
          'Could not reach the server'
        ) : (
          <Box component="span" sx={{ color: 'success.main' }}>
            {apiKeyCheck.projectName}
          </Box>
        )}
      </FormHelperText>
    </FormControl>
    <Typography variant="body2">
      Where can I get an{' '}
      <Link
        href={API_KEY_HELP}
        target="_blank"
        rel="noreferrer"
        underline="hover"
      >
        API key
      </Link>
      ?
    </Typography>
    <Button
      variant="contained"
      color="primary"
      onClick={onApply}
      disabled={!canApply}
    >
      Connect with API key
    </Button>
    {isInDevelopmentMode && (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Api key is included directly in Tolgee configuration. <br /> Use this
        setup only in development environment.
      </Typography>
    )}
  </Box>
);
