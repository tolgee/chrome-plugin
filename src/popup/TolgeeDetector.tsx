import React, { useEffect, useState } from 'react';
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
import { declaredProjectId, isOAuth, validateValues } from './tools';
import { sendToBackground } from './sendToBackground';
import { getActiveTab } from './activeTab';
import { safeOrigin } from '../oauth/url';
import { isApiKeyValid, useApiKeyCheck } from './useApiKeyCheck';
import { isOAuthUser, isProjectInfo } from './reducer';

const POPUP_WIDTH = 400;
const DEFAULT_SERVER = 'https://app.tolgee.io';
const LEARN_MORE_PROJECT_ID =
  'https://docs.tolgee.io/js-sdk/api/core_package/options#projectid';
const API_KEY_HELP =
  'https://docs.tolgee.io/platform/account_settings/api_keys_and_pat_tokens';

export const TolgeeDetector = () => {
  const [state, dispatch] = useDetectorForm();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
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

  const oauthUser = isOAuthUser(credentialsCheck) ? credentialsCheck : null;

  const hasSession = Boolean(storedValues || appliedValues);
  const notConnected = !hasSession;
  const apiKeyCheck = useApiKeyCheck(
    values?.apiUrl,
    values?.apiKey,
    tab === 'apiKey' && notConnected
  );
  const apiKeyValid = isApiKeyValid(apiKeyCheck);

  useEffect(() => {
    if (values?.apiKey && !values?.authToken) {
      setTab('apiKey');
    }
  }, [values?.apiKey, values?.authToken]);

  const handleApplyChange = () => {
    if (appliedValues) {
      dispatch({ type: 'STORE_VALUES' });
    } else {
      dispatch({ type: 'LOAD_VALUES' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // On the API-key tab, Enter must also respect the live key check (like the field's own handler and the button).
    if (
      e.key === 'Enter' &&
      validateValues(values) &&
      (tab !== 'apiKey' || apiKeyValid)
    ) {
      dispatch({ type: 'APPLY_VALUES' });
    }
  };

  const handleConnect = async () => {
    const apiUrl = values?.apiUrl || DEFAULT_SERVER;
    setConnecting(true);
    setConnectError(null);
    try {
      const projectId = declaredProjectId(libConfig);
      // Capture the target tab now: launchWebAuthFlow closes the popup, so the background does the injection and needs
      // the tab id up front.
      const activeTab = await getActiveTab();
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
          payload: { apiUrl, authToken: res.accessToken, projectId },
        });
      } else {
        setConnectError(res?.error || 'Connection failed');
      }
    } finally {
      setConnecting(false);
    }
  };

  const activeValues = appliedValues || storedValues || values;
  const isOauthSession = isOAuth(activeValues);

  const handleDisconnect = async () => {
    const apiUrl = activeValues?.apiUrl;
    if (isOauthSession && apiUrl) {
      const tab = await getActiveTab();
      await sendToBackground('OAUTH_LOGOUT', {
        apiUrl,
        authToken: activeValues?.authToken,
        projectId: activeValues?.projectId,
        pageOrigin: safeOrigin(tab?.url),
      });
    }
    dispatch({ type: 'CLEAR_ALL' });
  };

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

  const branchField = isProjectInfo(credentialsCheck) &&
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

  // The project is fixed by the credentials, so show it as a read-only field (same for API-key and OAuth sessions).
  const projectField = (name: string) => (
    <FormControl fullWidth>
      <TextField
        label="Project"
        variant="outlined"
        size="small"
        value={name}
        InputProps={{ readOnly: true }}
      />
    </FormControl>
  );

  const footer = (
    <Box display="flex" justifyContent="space-between" alignItems="center">
      <Box display="flex" alignItems="center" style={{ gap: 5 }}>
        <Switch
          size="small"
          checked={Boolean(appliedValues)}
          onChange={handleApplyChange}
          color="primary"
        />
        <Typography>Applied</Typography>
      </Box>
      <Button
        size="small"
        onClick={handleDisconnect}
        variant="contained"
        color="secondary"
      >
        Disconnect
      </Button>
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

    const projectDetected = declaredProjectId(libConfig) !== undefined;

    const rawServer = values?.apiUrl || DEFAULT_SERVER;
    let serverHost = rawServer;
    // Restrict the link target to http(s): the Server field is editable, and a value like `javascript:...` would become
    // an executable link running with extension privileges. Fall back to the default when it isn't a valid web URL yet.
    let serverLink = DEFAULT_SERVER;
    try {
      const parsed = new URL(rawServer);
      serverHost = parsed.host;
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        serverLink = parsed.toString();
      }
    } catch {
      serverLink = DEFAULT_SERVER;
    }
    if (hasSession) {
      return (
        <Box
          p={2}
          width={POPUP_WIDTH}
          style={{ display: 'flex', flexDirection: 'column', gap: 15 }}
        >
          <Typography variant="h6">Tolgee plugin</Typography>

          <FormControl fullWidth>
            <TextField
              label="Server"
              variant="outlined"
              size="small"
              value={values?.apiUrl ?? ''}
              InputProps={{ readOnly: true }}
            />
          </FormControl>

          {isOauthSession ? (
            <>
              <Typography style={{ fontSize: 12, color: 'green' }}>
                {oauthUser
                  ? `Connected as ${oauthUser.userFullName}`
                  : 'Connected'}
              </Typography>
              {declaredProjectInaccessible ? (
                <Alert severity="error" variant="outlined">
                  This site requests a project you can’t edit on {serverHost}.
                  Check the projectId in the site’s Tolgee configuration, or ask
                  for access.
                </Alert>
              ) : (
                declaredProject && projectField(declaredProject.name)
              )}
            </>
          ) : (
            <>
              {isProjectInfo(credentialsCheck) ? (
                projectField(credentialsCheck.projectName)
              ) : credentialsCheck === 'invalid' ? (
                <Typography style={{ fontSize: 12, color: 'red' }}>
                  Invalid API key
                </Typography>
              ) : null}
              {branchField}
            </>
          )}

          {footer}
        </Box>
      );
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
          (projectDetected ? (
            <Box display="flex" flexDirection="column" style={{ gap: 15 }}>
              {serverOpen ? (
                serverField
              ) : (
                <Typography variant="body2">
                  Connect to your account on{' '}
                  <Link
                    href={serverLink}
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
              {connectError && <Alert severity="error">{connectError}</Alert>}
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
                error={
                  apiKeyCheck === 'invalid' || apiKeyCheck === 'unreachable'
                }
                style={{ minHeight: 15 }}
                sx={{ marginLeft: 0 }}
              >
                {apiKeyCheck === null ? (
                  ''
                ) : apiKeyCheck === 'loading' ? (
                  '...'
                ) : apiKeyCheck === 'invalid' ? (
                  'Invalid API key for this server'
                ) : apiKeyCheck === 'unreachable' ? (
                  'Could not reach the server'
                ) : (
                  <span style={{ color: 'green' }}>
                    {apiKeyCheck.projectName}
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
            <Button
              variant="contained"
              color="primary"
              onClick={() => dispatch({ type: 'APPLY_VALUES' })}
              disabled={
                !validateValues(values) || valuesNotChanged || !apiKeyValid
              }
            >
              Connect with API key
            </Button>
            {isInDevelopmentMode && (
              <Typography style={{ fontSize: 12, color: '#535353' }}>
                Api key is included directly in Tolgee configuration. <br /> Use
                this setup only in development environment.
              </Typography>
            )}
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
