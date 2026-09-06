import { Alert, AlertTitle } from '@mui/material';
import { MIN_SDK_VERSION_LABEL } from '../constants';

export const SdkTooOldAlert = () => (
  <Alert severity="info" data-testid="sdk-too-old">
    <AlertTitle>Sign-in needs a newer Tolgee SDK</AlertTitle>
    This site uses an older version of the Tolgee SDK, so signing in with your
    account isn&apos;t available here. Ask the site&apos;s developer to update
    @tolgee/web to {MIN_SDK_VERSION_LABEL} or newer. You can still connect with
    a project API key.
  </Alert>
);
