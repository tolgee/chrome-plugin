import { FormHelperText, Link } from '@mui/material';
import { CredentialsCheck } from './popupState';

export const API_KEY_HELP =
  'https://docs.tolgee.io/platform/account_settings/api_keys_and_pat_tokens';

export const ApiKeyHelper = ({
  apiKeyCheck,
  serverHost,
}: {
  apiKeyCheck: CredentialsCheck;
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
