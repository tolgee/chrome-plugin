import React, { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  Link,
  TextField,
  Typography,
} from '@mui/material';

import { ApiKeyCheck } from './useApiKeyCheck';
import { VisibilityIcon, VisibilityOffIcon } from './icons';

const API_KEY_HELP =
  'https://docs.tolgee.io/platform/account_settings/api_keys_and_pat_tokens';

type Props = {
  serverField: React.ReactNode;
  serverHost: string;
  apiKey: string;
  onChangeApiKey: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  apiKeyCheck: ApiKeyCheck;
  canApply: boolean;
  onApply: () => void;
  onBack: () => void;
  isInDevelopmentMode: boolean;
};

export const ApiKeyTab = ({
  serverField,
  serverHost,
  apiKey,
  onChangeApiKey,
  onKeyDown,
  apiKeyCheck,
  canApply,
  onApply,
  onBack,
  isInDevelopmentMode,
}: Props) => {
  const [keyVisible, setKeyVisible] = useState(false);
  const invalid = apiKeyCheck === 'invalid';

  return (
    <>
      {serverField}
      <FormControl fullWidth>
        <TextField
          label="API key"
          variant="outlined"
          type={keyVisible ? 'text' : 'password'}
          value={apiKey}
          error={invalid}
          onChange={(e) => onChangeApiKey(e.target.value)}
          onKeyDown={onKeyDown}
          size="small"
          inputProps={{ 'data-testid': 'api-key-input' }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  edge="end"
                  aria-label={keyVisible ? 'Hide API key' : 'Show API key'}
                  onClick={() => setKeyVisible((visible) => !visible)}
                >
                  {keyVisible ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <FormHelperText
          error={apiKeyCheck === 'unreachable'}
          style={{ minHeight: 15 }}
          sx={{ marginLeft: 0 }}
          data-testid="api-key-check"
        >
          {invalid ? (
            ''
          ) : apiKeyCheck === 'loading' ? (
            '...'
          ) : apiKeyCheck === 'unreachable' ? (
            'Could not reach the server'
          ) : apiKeyCheck !== null ? (
            <Box component="span" sx={{ color: 'success.main' }}>
              {apiKeyCheck.projectName}
            </Box>
          ) : (
            <>
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
            </>
          )}
        </FormHelperText>
      </FormControl>
      {invalid && (
        <Alert severity="error" data-testid="api-key-invalid">
          <AlertTitle>
            This API key doesn&apos;t work on {serverHost}
          </AlertTitle>
          Check for a typo, or that the key belongs to this server and
          hasn&apos;t been revoked.{' '}
          <Link
            href={API_KEY_HELP}
            target="_blank"
            rel="noreferrer"
            underline="hover"
          >
            Where to find your API key
          </Link>
        </Alert>
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={onApply}
        disabled={!canApply}
        data-testid="connect-with-api-key"
      >
        Connect with API key
      </Button>
      {isInDevelopmentMode && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Api key is included directly in Tolgee configuration. <br /> Use this
          setup only in development environment.
        </Typography>
      )}
      <Box display="flex" justifyContent="center">
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={onBack}
          data-testid="all-connection-options"
        >
          All connection options
        </Link>
      </Box>
    </>
  );
};
