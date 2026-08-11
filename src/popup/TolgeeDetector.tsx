import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  Link,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { useDetectorForm } from './useDetectorForm';
import { decodeTokenProjectSet, validateValues } from './tools';
import { sendToBackground } from './sendToBackground';

const POPUP_WIDTH = 400;
const DEFAULT_SERVER = 'https://app.tolgee.io';
const LEARN_MORE_PROJECT_ID =
  'https://docs.tolgee.io/js-sdk/api/core_package/options#projectid';
const API_KEY_HELP =
  'https://docs.tolgee.io/platform/account_settings/api_keys_and_pat_tokens';
// Sentinel option for an unscoped ("all projects") token; a negative id can't collide with a real project id.
const ALL_PROJECTS_OPTION = { id: -1, name: 'All projects' };

export const TolgeeDetector = () => {
  const [state, dispatch] = useDetectorForm();
  const [connecting, setConnecting] = useState(false);
  const [tab, setTab] = useState<'login' | 'apiKey'>('login');
  const [serverOpen, setServerOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const {
    error,
    values,
    storedValues,
    appliedValues,
    libConfig,
    tolgeePresent,
    credentialsCheck,
    branches,
    declaredProject,
    declaredProjectInaccessible,
  } = state;

  const oauthUser =
    credentialsCheck !== null &&
    typeof credentialsCheck === 'object' &&
    'oauth' in credentialsCheck
      ? credentialsCheck
      : null;

  // A single-project token auto-selects its project (done in the reducer); only an "all projects" token needs the
  // manual picker below.
  const allProjectsToken = decodeTokenProjectSet(values?.authToken) === '*';

  // A restored API-key session should reopen on the API KEY tab; an OAuth session stays on LOGIN.
  useEffect(() => {
    if (values?.apiKey && !values?.authToken) {
      setTab('apiKey');
    }
  }, [values?.apiKey, values?.authToken]);

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
    const apiUrl = values?.apiUrl || DEFAULT_SERVER;
    setConnecting(true);
    try {
      // Hint the project the page is configured for (exposed via the handshake), so the consent screen pre-selects it
      // and the minted token is scoped to it. On a public project the hint resolves via the community floor.
      const hinted = (libConfig?.config as { projectId?: number | string })
        ?.projectId;
      const projectId =
        hinted !== undefined && hinted !== '' ? Number(hinted) : undefined;
      // Capture the target tab now: launchWebAuthFlow closes the popup, so the background does the injection and needs
      // the tab id up front.
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const res = (await sendToBackground('OAUTH_LOGIN', {
        apiUrl,
        projectId,
        tabId: activeTab?.id,
      })) as {
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

  const serverField = (
    <FormControl fullWidth>
      <TextField
        label="Server"
        variant="outlined"
        value={values?.apiUrl ?? ''}
        placeholder={DEFAULT_SERVER}
        onChange={(e) =>
          dispatch({
            type: 'CHANGE_VALUES',
            payload: { apiUrl: e.target.value },
          })
        }
        onKeyDown={handleKeyDown}
        size="small"
      />
    </FormControl>
  );

  const branchField = credentialsCheck !== null &&
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
                typeof newValue === 'string' ? newValue : newValue?.name ?? '',
            },
          });
        }}
        onInputChange={(_e: any, newInput: string, reason: string) => {
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
              <span style={{ color: '#999', marginLeft: 6 }}>default</span>
            )}
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Branch"
            variant="outlined"
            placeholder={libConfig?.config?.branch || 'Default branch'}
            helperText="Leave empty to use the branch from SDK config"
            onKeyDown={handleKeyDown}
          />
        )}
      />
    );

  const appliedControls = (isInDevelopmentMode: boolean) => (
    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
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
      </Box>
    </Box>
  );

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

    const detectedProjectId = (
      libConfig?.config as { projectId?: number | string }
    )?.projectId;
    const projectDetected =
      detectedProjectId !== undefined && detectedProjectId !== '';

    let serverHost = values?.apiUrl || DEFAULT_SERVER;
    try {
      serverHost = new URL(serverHost).host;
    } catch {
      // keep the raw value if it's not a full URL yet
    }

    return (
      <Box
        p={2}
        width={POPUP_WIDTH}
        style={{ display: 'flex', flexDirection: 'column', gap: 15 }}
      >
        <Typography variant="h6">Tolgee plugin</Typography>

        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab value="login" label="Login" />
          <Tab value="apiKey" label="API key" />
        </Tabs>

        {tab === 'login' &&
          (oauthUser ? (
            <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
              <Typography style={{ fontSize: 12, color: 'green' }}>
                Connected as {oauthUser.userFullName}
              </Typography>
              {declaredProjectInaccessible ? (
                <Alert severity="error" variant="outlined">
                  This site requests a project you can’t edit on {serverHost}.
                  Check the projectId in the site’s Tolgee configuration, or ask
                  for access.
                </Alert>
              ) : declaredProject ? (
                <Autocomplete
                  size="small"
                  disableClearable
                  options={
                    allProjectsToken
                      ? [declaredProject, ALL_PROJECTS_OPTION]
                      : [declaredProject]
                  }
                  getOptionLabel={(option) => option.name}
                  isOptionEqualToValue={(option, value) =>
                    option.id === value.id
                  }
                  value={
                    values?.projectId != null
                      ? declaredProject
                      : ALL_PROJECTS_OPTION
                  }
                  onChange={(_e, newValue) => {
                    dispatch({
                      type: 'OAUTH_SET_PROJECT',
                      payload: {
                        projectId:
                          newValue && newValue.id !== ALL_PROJECTS_OPTION.id
                            ? newValue.id
                            : undefined,
                      },
                    });
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Project"
                      variant="outlined"
                      helperText="Project to edit in-context"
                    />
                  )}
                />
              ) : (
                <Box display="flex" justifyContent="center">
                  <CircularProgress size={20} />
                </Box>
              )}
              {appliedControls(isInDevelopmentMode)}
            </Box>
          ) : projectDetected ? (
            <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
              {serverOpen ? (
                serverField
              ) : (
                <Typography variant="body2">
                  Connect to your account on{' '}
                  <Link
                    href={values?.apiUrl || DEFAULT_SERVER}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                  >
                    {serverHost}
                  </Link>{' '}
                  and start translating.
                </Typography>
              )}
              <Button
                variant="contained"
                color="primary"
                disabled={connecting}
                onClick={handleConnect}
              >
                {connecting ? 'Connecting…' : 'Connect to Tolgee'}
              </Button>
              {serverOpen ? (
                <Typography style={{ fontSize: 12, color: '#535353' }}>
                  Change if you have your own instance of Tolgee.
                </Typography>
              ) : (
                <Box display="flex" justifyContent="center">
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => setServerOpen(true)}
                  >
                    Change server
                  </Link>
                </Box>
              )}
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
              <Typography variant="body2" fontWeight="bold">
                Project not detected
              </Typography>
              <Typography variant="body2">
                Ask the website administrator to add projectId to the Tolgee
                configuration.{' '}
                <Link
                  href={LEARN_MORE_PROJECT_ID}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                >
                  Learn more
                </Link>
              </Typography>
              <Button variant="contained" color="primary" disabled>
                Connect to Tolgee
              </Button>
            </Box>
          ))}

        {tab === 'apiKey' && (
          <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
            {serverField}
            <FormControl fullWidth>
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
                style={{ minHeight: 15 }}
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
            <Typography variant="body2">
              Where can I get an{' '}
              <Link
                href={API_KEY_HELP}
                target="_blank"
                rel="noreferrer"
                underline="hover"
              >
                API key
              </Link>
              ?
            </Typography>
            {branchField}
            <Button
              variant="contained"
              color="primary"
              onClick={() => dispatch({ type: 'APPLY_VALUES' })}
              disabled={!validateValues(values) || valuesNotChanged}
            >
              Connect with API key
            </Button>
            {appliedControls(isInDevelopmentMode)}
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
