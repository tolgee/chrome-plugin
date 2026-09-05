import {
  Alert,
  AlertTitle,
  Button,
  IconButton,
  Link,
  Typography,
} from '@mui/material';
import { SdkTooOldAlert } from './SdkTooOldAlert';
import { hostOf } from '../oauth/url';
import { CloseIcon } from './icons';
import { ConnectError } from './useOAuthConnect';

const LEARN_MORE_PROJECT_ID =
  'https://docs.tolgee.io/js-sdk/api/core_package/options#projectid';

type Props = {
  projectDetected: boolean;
  sdkTooOld: boolean;
  serverHost: string;
  serverLink: string;
  serverInvalid: boolean;
  connecting: boolean;
  connectError: ConnectError | null;
  onDismissRefusal: () => void;
  onConnect: () => void;
  onUseApiKey: () => void;
};

export const LoginTab = ({
  projectDetected,
  sdkTooOld,
  serverHost,
  serverLink,
  serverInvalid,
  connecting,
  connectError,
  onDismissRefusal,
  onConnect,
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

  if (sdkTooOld) {
    return (
      <>
        <SdkTooOldAlert />
        {useApiKeyButton}
      </>
    );
  }

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
        and start editing.
      </Typography>
      <Button
        variant="contained"
        color="primary"
        disabled={connecting || serverInvalid}
        onClick={onConnect}
        data-testid="connect-oauth"
      >
        {connecting ? 'Connecting...' : 'Connect to Tolgee'}
      </Button>
      {connectError &&
        ('code' in connectError ? (
          <Alert
            severity="error"
            data-testid="connect-project-inaccessible"
            action={
              <IconButton
                size="small"
                color="inherit"
                aria-label="Dismiss"
                title="Dismiss"
                onClick={onDismissRefusal}
                data-testid="dismiss-connect-refusal"
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            <AlertTitle>
              This account can&apos;t access project #{connectError.projectId}{' '}
              on {hostOf(connectError.apiUrl)}
            </AlertTitle>
            Sign in with an account that has access to it. The project may also
            no longer exist in Tolgee.
          </Alert>
        ) : (
          <Alert severity="error" data-testid="connect-error">
            {connectError.message}
          </Alert>
        ))}
      {useApiKeyButton}
    </>
  );
};
