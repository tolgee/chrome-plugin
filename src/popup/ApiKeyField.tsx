import React, { useState } from 'react';
import { IconButton, InputAdornment, Link, TextField } from '@mui/material';
import { abbreviateApiKey } from './branch';
import { VisibilityIcon, VisibilityOffIcon } from './icons';

type Props = {
  apiKey: string;
  verified: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

export const ApiKeyField = ({
  apiKey,
  verified,
  invalid,
  onChange,
  onKeyDown,
}: Props) => {
  const [keyVisible, setKeyVisible] = useState(false);

  if (verified) {
    return (
      <TextField
        label="API key"
        variant="outlined"
        value={abbreviateApiKey(apiKey)}
        onKeyDown={onKeyDown}
        size="small"
        inputProps={{ 'data-testid': 'api-key-input', readOnly: true }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Link
                component="button"
                type="button"
                underline="hover"
                variant="caption"
                onClick={() => onChange('')}
                data-testid="use-another-key"
              >
                Use another key
              </Link>
            </InputAdornment>
          ),
        }}
      />
    );
  }
  return (
    <TextField
      label="API key"
      variant="outlined"
      type={keyVisible ? 'text' : 'password'}
      value={apiKey}
      error={invalid}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      size="small"
      inputProps={{ 'data-testid': 'api-key-input' }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              size="small"
              edge="end"
              aria-label={keyVisible ? 'Hide API key' : 'Show API key'}
              onClick={() => setKeyVisible((visible) => !visible)}
              data-testid="toggle-api-key-visibility"
            >
              {keyVisible ? (
                <VisibilityOffIcon fontSize="small" />
              ) : (
                <VisibilityIcon fontSize="small" />
              )}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};
