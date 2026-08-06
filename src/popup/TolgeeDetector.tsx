import React, { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  FormControl,
  FormHelperText,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import { useDetectorForm } from './useDetectorForm';
import { validateValues } from './tools';
import { sendToBackground } from './sendToBackground';

const POPUP_WIDTH = 400;

export const TolgeeDetector = () => {
  const [state, dispatch] = useDetectorForm();
  const [connecting, setConnecting] = useState(false);
  const [keySigninOpen, setKeySigninOpen] = useState(false);

  const {
    error,
    values,
    storedValues,
    appliedValues,
    libConfig,
    tolgeePresent,
    credentialsCheck,
    branches,
  } = state;
  const [branchOpen, setBranchOpen] = useState(false);

  const handleApplyChange = async () => {
    if (appliedValues) {
      dispatch({ type: 'STORE_VALUES' });
    } else {
      dispatch({ type: 'LOAD_VALUES' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // on enter
    if (e.keyCode === 13 && validateValues(values)) {
      dispatch({ type: 'APPLY_VALUES' });
    }
  };

  const handleConnect = async () => {
    const apiUrl = values?.apiUrl;
    if (!apiUrl) {
      return;
    }
    setConnecting(true);
    try {
      const res = (await sendToBackground('OAUTH_LOGIN', { apiUrl })) as {
        accessToken?: string;
        error?: string;
      };
      if (res?.accessToken) {
        dispatch({
          type: 'OAUTH_APPLY',
          payload: { apiUrl, authToken: res.accessToken },
        });
      }
    } finally {
      setConnecting(false);
    }
  };

  const dataPresent = storedValues || appliedValues;
  if (error) {
    return (
      <Box width={POPUP_WIDTH} p={1} color="red">
        <Typography variant="body2" fontWeight="bold">
          Error: {error}
        </Typography>
      </Box>
    );
  } else if (tolgeePresent === 'loading') {
    return (
      <Box width={POPUP_WIDTH} p={1} display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  } else if (tolgeePresent === 'present' || appliedValues) {
    const isInDevelopmentMode =
      !appliedValues &&
      (libConfig?.mode || libConfig?.config?.mode) === 'development';

    const valuesNotChanged =
      isInDevelopmentMode &&
      libConfig?.config.apiKey === values?.apiKey &&
      libConfig?.config.apiUrl === values?.apiUrl &&
      (libConfig?.config.branch || '') === (values?.branch || '');

    return (
      <Box
        p={1}
        width={POPUP_WIDTH}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 15,
        }}
      >
        <Typography variant="subtitle1" style={{ paddingBottom: 8 }}>
          Tolgee settings
        </Typography>
        <TextField
          label="API url"
          variant="outlined"
          value={values?.apiUrl || ''}
          onChange={(e) =>
            dispatch({
              type: 'CHANGE_VALUES',
              payload: { apiUrl: e.target.value },
            })
          }
          onKeyDown={handleKeyDown}
          size="small"
        />
        <Button
          size="small"
          variant="contained"
          color="primary"
          disabled={!values?.apiUrl || connecting}
          onClick={handleConnect}
        >
          {connecting ? 'Connecting…' : 'Connect with Tolgee'}
        </Button>
        <Button
          size="small"
          variant="text"
          color="inherit"
          onClick={() => setKeySigninOpen((o) => !o)}
          style={{ justifyContent: 'flex-start', textTransform: 'none' }}
        >
          {keySigninOpen ? '▾' : '▸'} API key sign in
        </Button>
        <Collapse in={keySigninOpen}>
          <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
            <FormControl>
              <TextField
                label="API key"
                variant="outlined"
                value={values?.apiKey || ''}
                onChange={(e) =>
                  dispatch({
                    type: 'CHANGE_VALUES',
                    payload: { apiKey: e.target.value },
                  })
                }
                onKeyDown={handleKeyDown}
                size="small"
              />
              <FormHelperText
                error={credentialsCheck === 'invalid'}
                style={{ height: 15 }}
                sx={{ marginLeft: 0 }}
              >
                {credentialsCheck === null ? (
                  ''
                ) : credentialsCheck === 'loading' ? (
                  '...'
                ) : credentialsCheck === 'invalid' ? (
                  'Invalid'
                ) : 'oauth' in credentialsCheck ? (
                  <span style={{ color: 'green' }}>
                    Connected as {credentialsCheck.userFullName}
                  </span>
                ) : (
                  <span style={{ color: 'green' }}>
                    {credentialsCheck.projectName}
                  </span>
                )}
              </FormHelperText>
            </FormControl>
            {credentialsCheck !== null &&
              typeof credentialsCheck === 'object' &&
              'branchingEnabled' in credentialsCheck &&
              credentialsCheck.branchingEnabled && (
                <Autocomplete
                  style={{ marginBottom: branchOpen ? 150 : 0 }}
                  open={branchOpen}
                  onOpen={() => setBranchOpen(true)}
                  onClose={() => setBranchOpen(false)}
                  freeSolo
                  size="small"
                  disablePortal
                  slotProps={{
                    popper: {
                      placement: 'bottom',
                      modifiers: [{ name: 'flip', enabled: false }],
                    },
                  }}
                  ListboxProps={{ style: { maxHeight: 150 } }}
                  options={branches ?? []}
                  getOptionLabel={(option) =>
                    typeof option === 'string' ? option : option.name
                  }
                  value={
                    branches?.find((b) => b.name === values?.branch) ??
                    values?.branch ??
                    null
                  }
                  onChange={(_e: any, newValue: any) => {
                    dispatch({
                      type: 'CHANGE_VALUES',
                      payload: {
                        branch:
                          typeof newValue === 'string'
                            ? newValue
                            : newValue?.name ?? '',
                      },
                    });
                  }}
                  onInputChange={(
                    _e: any,
                    newInput: string,
                    reason: string
                  ) => {
                    if (reason === 'input') {
                      dispatch({
                        type: 'CHANGE_VALUES',
                        payload: { branch: newInput },
                      });
                    }
                  }}
                  renderOption={(props, option) => (
                    <li {...props}>
                      {option.name}
                      {option.isDefault && (
                        <span style={{ color: '#999', marginLeft: 6 }}>
                          default
                        </span>
                      )}
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Branch"
                      variant="outlined"
                      placeholder={
                        libConfig?.config?.branch || 'Default branch'
                      }
                      helperText="Leave empty to use the branch from SDK config"
                      onKeyDown={handleKeyDown}
                    />
                  )}
                />
              )}
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box display="flex" style={{ gap: 5 }}>
                {dataPresent ? (
                  <>
                    <Switch
                      size="small"
                      checked={Boolean(appliedValues)}
                      onChange={handleApplyChange}
                      color="primary"
                    />
                    <Typography>Applied</Typography>
                  </>
                ) : isInDevelopmentMode ? (
                  <Typography style={{ fontSize: 12, color: '#535353' }}>
                    Api key is included directly in Tolgee configuration. <br />{' '}
                    Use this setup only in development environment.
                  </Typography>
                ) : (
                  ''
                )}
              </Box>
              <Box display="flex" style={{ gap: 10 }}>
                {dataPresent && (
                  <Button
                    size="small"
                    onClick={() => dispatch({ type: 'CLEAR_ALL' })}
                    variant="contained"
                    color="secondary"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="small"
                  onClick={() => dispatch({ type: 'APPLY_VALUES' })}
                  variant="contained"
                  color="primary"
                  disabled={!validateValues(values) || valuesNotChanged}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          </Box>
        </Collapse>
      </Box>
    );
  } else if (tolgeePresent === 'legacy') {
    return (
      <Box width={POPUP_WIDTH} p={1}>
        <Typography variant="body1">
          This website is using old version of Tolgee.
        </Typography>
      </Box>
    );
  } else {
    return (
      <Box width={POPUP_WIDTH} p={1}>
        <Typography variant="body1">
          This website doesn't seem to be using Tolgee.
        </Typography>
      </Box>
    );
  }
};
