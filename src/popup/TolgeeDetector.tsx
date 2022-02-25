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
} from '@material-ui/core';

import { useDetectorForm, validateValues } from './useDetectorForm';

const POPUP_WIDTH = 400;

export const TolgeeDetector = () => {
  const [state, dispatch] = useDetectorForm();

  const {
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

  const handleKeyDown = (e) => {
    // on enter
    if (e.keyCode === 13 && validateValues(values)) {
      dispatch({ type: 'APPLY_VALUES' });
    }
  };

  const dataPresent = storedValues || appliedValues;
  if (tolgeePresent === 'loading') {
    return (
      <Box width={POPUP_WIDTH} p={1} display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  } else if (tolgeePresent === 'present' || appliedValues) {
    const disabled =
      !dataPresent &&
      !appliedValues &&
      libConfig?.config?.mode === 'development';

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
          disabled={disabled}
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
            disabled={disabled}
          />
          <FormHelperText
            error={credentialsCheck === 'invalid'}
            style={{ height: 15 }}
          >
            {credentialsCheck === null ? (
              ''
            ) : credentialsCheck === 'loading' ? (
              '...'
            ) : credentialsCheck === 'invalid' ? (
              'Invalid'
            ) : (
              <span style={{ color: 'green' }}>Valid</span>
            )}
          </FormHelperText>
        </FormControl>
        {!disabled && (
          <Box display="flex" justifyContent="space-between">
            <Box display="flex" style={{ gap: 5 }}>
              {dataPresent && (
                <>
                  <Switch
                    size="small"
                    checked={Boolean(appliedValues)}
                    onChange={handleApplyChange}
                    color="primary"
                  />
                  <Typography>Applied</Typography>
                </>
              )}
            </Box>
            <Box display="flex" style={{ gap: 10 }}>
              {dataPresent && (
                <Button
                  size="small"
                  onClick={() => dispatch({ type: 'CLEAR_ALL' })}
                  variant="contained"
                >
                  Clear
                </Button>
              )}
              <Button
                size="small"
                onClick={() => dispatch({ type: 'APPLY_VALUES' })}
                variant="contained"
                color="primary"
                disabled={!validateValues(values)}
              >
                Apply
              </Button>
            </Box>
          </Box>
        )}
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
