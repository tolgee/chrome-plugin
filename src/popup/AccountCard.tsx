import { Box, Paper, Typography } from '@mui/material';
import { abbreviateApiKey } from './branch';
import { accountName, Session } from './connectionSummary';

export const AccountCard = ({
  session,
  serverHost,
}: {
  session: Session;
  serverHost: string;
}) => {
  const detail =
    session.kind === 'oauth'
      ? `Signed in on ${serverHost}`
      : `${abbreviateApiKey(session.apiKey)} on ${serverHost}`;
  return (
    <Paper
      variant="outlined"
      data-testid="account-card"
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        py: 1.25,
      }}
    >
      <Box minWidth={0}>
        <Typography
          variant="body2"
          fontWeight="medium"
          noWrap
          data-testid="account-name"
        >
          {accountName(session)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          data-testid="account-detail"
        >
          {detail}
        </Typography>
      </Box>
    </Paper>
  );
};
