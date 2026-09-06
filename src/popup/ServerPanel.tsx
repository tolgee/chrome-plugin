import React from 'react';
import { FormControl, TextField, Typography } from '@mui/material';

type Props = {
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

export const ServerPanel = ({
  value,
  placeholder,
  invalid,
  onChange,
  onKeyDown,
}: Props) => (
  <>
    <FormControl fullWidth>
      <TextField
        label="Server"
        variant="outlined"
        value={value}
        placeholder={placeholder}
        error={invalid}
        inputProps={{ 'data-testid': 'server-input' }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        size="small"
      />
    </FormControl>
    <Typography
      variant="caption"
      sx={{ color: 'text.secondary' }}
      data-testid="server-helper"
    >
      Change if you have your own instance of Tolgee.
    </Typography>
  </>
);
