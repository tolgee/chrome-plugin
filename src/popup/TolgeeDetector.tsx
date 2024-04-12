import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import { useDetectorForm } from './useDetectorForm';
import { validateValues } from './tools';

const POPUP_WIDTH = 400;

export const TolgeeDetector = () => {
  const [state, dispatch] = useDetectorForm();

  const {
    error,
    values,
    storedValues,
    appliedValues,
    libConfig,
    tolgeePresent,
    credentialsCheck,
  } = state;

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
      libConfig?.config.apiUrl === values?.apiUrl;

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
            ) : (
              <span style={{ color: 'green' }}>
                {credentialsCheck.projectName}
              </span>
            )}
          </FormHelperText>
        </FormControl>
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
                Api key is included directly in Tolgee configuration. <br /> Use
                this setup only in development environment.
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
