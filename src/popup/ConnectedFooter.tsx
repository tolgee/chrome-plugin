import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { footerAction, Session } from './connectionSummary';

const Footer = ({
  note,
  action,
}: {
  note?: string;
  action: React.ReactNode;
}) => (
  <Box
    display="flex"
    justifyContent={note ? 'space-between' : 'flex-end'}
    alignItems="center"
    gap={1}
  >
    {note && (
      <Typography
        variant="caption"
        color="text.secondary"
        data-testid="footer-note"
      >
        {note}
      </Typography>
    )}
    {action}
  </Box>
);

export const ConnectedFooter = ({
  session,
  note,
  onSignOut,
  onUseAnotherKey,
}: {
  session: Session;
  note?: string;
  onSignOut: () => void;
  onUseAnotherKey: () => void;
}) =>
  session.kind === 'apiKey' && session.source === 'site' ? (
    <Footer
      note="Editing is on because the site turned it on."
      action={
        <Button
          size="small"
          onClick={onUseAnotherKey}
          data-testid="override-site-key"
        >
          Use another key
        </Button>
      }
    />
  ) : (
    <Footer
      note={note}
      action={
        <Button
          size="small"
          color="error"
          onClick={onSignOut}
          data-testid="sign-out"
        >
          {footerAction(session)}
        </Button>
      }
    />
  );
