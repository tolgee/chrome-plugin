import {
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  FormHelperText,
  Link,
  Typography,
} from '@mui/material';
import { ApiKeyCheck, isApiKeyValid } from './apiKeyCheck';
import { ApiKeyRejectedAlert } from './ApiKeyRejectedAlert';
import { keyAllowsEditing } from './apiKeyScreen';

const API_KEY_HELP =
  'https://docs.tolgee.io/platform/account_settings/api_keys_and_pat_tokens';

export const ApiKeyHelper = ({
  apiKeyCheck,
  serverHost,
}: {
  apiKeyCheck: ApiKeyCheck;
  serverHost: string;
}) => {
  const unreachable = apiKeyCheck === 'unreachable';
  if (apiKeyCheck !== null && !unreachable) {
    return null;
  }
  return (
    <FormHelperText
      error={unreachable}
      sx={{ marginLeft: 0 }}
      data-testid="api-key-check"
    >
      {unreachable ? (
        `Could not reach ${serverHost}`
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
  );
};

export const ApiKeyCheckAlerts = ({
  apiKeyCheck,
  serverHost,
}: {
  apiKeyCheck: ApiKeyCheck;
  serverHost: string;
}) => (
  <>
    {apiKeyCheck === 'loading' && (
      <Box
        display="flex"
        alignItems="center"
        gap={1}
        data-testid="api-key-checking"
      >
        <CircularProgress size="1em" color="inherit" />
        <Typography variant="body2" color="text.secondary">
          Checking key…
        </Typography>
      </Box>
    )}
    {apiKeyCheck === 'invalid' && (
      <ApiKeyRejectedAlert serverHost={serverHost} testId="api-key-invalid">
        <Link
          href={API_KEY_HELP}
          target="_blank"
          rel="noreferrer"
          underline="hover"
        >
          Where to find your API key
        </Link>
      </ApiKeyRejectedAlert>
    )}
    {isApiKeyValid(apiKeyCheck) &&
      (keyAllowsEditing(apiKeyCheck) ? (
        <Alert severity="success" data-testid="api-key-valid">
          <AlertTitle sx={{ marginBottom: 0 }}>
            Key works for {apiKeyCheck.projectName}
          </AlertTitle>
        </Alert>
      ) : (
        <Alert severity="warning" data-testid="api-key-view-only">
          <AlertTitle>This key can only view strings</AlertTitle>
          You can look up strings on this page but not change them.
        </Alert>
      ))}
  </>
);
