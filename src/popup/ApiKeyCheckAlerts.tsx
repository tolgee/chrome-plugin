import {
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  Link,
  Typography,
} from '@mui/material';
import { ApiKeyRejectedAlert } from './ApiKeyRejectedAlert';
import { API_KEY_HELP } from './ApiKeyHelper';
import { keyAllowsEditing } from './apiKeyScreen';
import { CredentialsCheck, isProjectInfo } from './popupState';

export const ApiKeyCheckAlerts = ({
  apiKeyCheck,
  serverHost,
}: {
  apiKeyCheck: CredentialsCheck;
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
    {isProjectInfo(apiKeyCheck) &&
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
