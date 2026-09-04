import React from 'react';
import { Box, Typography } from '@mui/material';

import { POPUP_WIDTH } from '../constants';
import logo from '../../icons/logo.png';

type Props = {
  title: string;
  children: React.ReactNode;
  testId?: string;
};

export const PopupFrame = ({ title, children, testId }: Props) => (
  <Box
    data-testid={testId}
    p={2}
    width={POPUP_WIDTH}
    boxSizing="border-box"
    display="flex"
    flexDirection="column"
    gap={1.75}
  >
    <Box display="flex" alignItems="center" gap={1.25}>
      <img src={logo} width={26} height={26} alt="" />
      <Typography variant="h6">{title}</Typography>
    </Box>
    {children}
  </Box>
);
