import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';

import { POPUP_WIDTH } from '../constants';
import logo from '../../icons/logo.png';
import { SettingsIcon } from './icons';

export type ServerSettings = {
  open: boolean;
  onToggle: () => void;
  panel: React.ReactNode;
};

type Props = {
  title: string;
  children: React.ReactNode;
  testId?: string;
  serverSettings?: ServerSettings;
};

export const PopupFrame = ({
  title,
  children,
  testId,
  serverSettings,
}: Props) => (
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
      <Typography variant="h6" flexGrow={1}>
        {title}
      </Typography>
      {serverSettings && (
        <IconButton
          size="small"
          title="Server settings"
          aria-label="Server settings"
          aria-expanded={serverSettings.open}
          color={serverSettings.open ? 'primary' : 'default'}
          onClick={serverSettings.onToggle}
          data-testid="server-settings"
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
    {serverSettings?.open && (
      <Box
        display="flex"
        flexDirection="column"
        gap={0.5}
        data-testid="server-panel"
      >
        {serverSettings.panel}
      </Box>
    )}
    {children}
  </Box>
);
