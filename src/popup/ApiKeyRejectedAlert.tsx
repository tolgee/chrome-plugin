import React from 'react';
import { Alert, AlertTitle } from '@mui/material';

export const ApiKeyRejectedAlert = ({
  serverHost,
  testId,
  children,
}: {
  serverHost: string;
  testId: string;
  children?: React.ReactNode;
}) => (
  <Alert severity="error" data-testid={testId}>
    <AlertTitle>This API key doesn&apos;t work on {serverHost}</AlertTitle>
    Check for a typo, or that the key belongs to this server and hasn&apos;t
    been revoked. {children}
  </Alert>
);
