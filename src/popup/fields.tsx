import React from 'react';
import { Typography } from '@mui/material';

export const Label = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" color="text.secondary">
    {children}
  </Typography>
);

export const Value = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" fontWeight="medium" noWrap minWidth={0}>
    {children}
  </Typography>
);
