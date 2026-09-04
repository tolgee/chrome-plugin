import React, { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControl,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { useDetectorForm } from './useDetectorForm';
import {
  canApplyOnEnter,
  declaredProjectId,
  httpDisplayUrl,
  isOAuth,
  validateValues,
} from './tools';
import { sendToBackground } from './sendToBackground';
import { getActiveTab } from './activeTab';
import { safeOrigin } from '../oauth/url';
import { projectKeyFor } from '../oauth/sessionRules';
import { isApiKeyValid, useApiKeyCheck } from './useApiKeyCheck';
import { isOAuthUser, isProjectInfo } from './reducer';
import { ConnectedPanel } from './ConnectedPanel';
import { LoginTab } from './LoginTab';
import { ApiKeyTab } from './ApiKeyTab';
import { POPUP_WIDTH } from '../constants';

const DEFAULT_SERVER = 'https://app.tolgee.io';

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

  const isInDevelopmentMode =
    !appliedValues &&
    (libConfig?.mode || libConfig?.config?.mode) === 'development';

  const valuesNotChanged =
    isInDevelopmentMode &&
    libConfig?.config.apiKey === values?.apiKey &&
    libConfig?.config.apiUrl === values?.apiUrl &&
    (libConfig?.config.branch || '') === (values?.branch || '');

  const canApplyApiKey =
    Boolean(validateValues(values)) && !valuesNotChanged && apiKeyValid;

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
    if (
      e.key === 'Enter' &&
      canApplyOnEnter(hasSession, tab, values, canApplyApiKey)
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
      if (res?.accessToken && projectId !== undefined) {
        dispatch({
          type: 'OAUTH_APPLY',
          payload: {
            apiUrl,
            authToken: res.accessToken,
            projectId,
            projectKey: projectKeyFor(projectId),
          },
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
    if (isOauthSession) {
      const activeTab = await getActiveTab();
      await sendToBackground('OAUTH_LOGOUT', {
        pageOrigin: safeOrigin(activeTab?.url),
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
    const projectDetected = declaredProjectId(libConfig) !== undefined;

    const { host: serverHost, link: serverLink } = httpDisplayUrl(
      values?.apiUrl || DEFAULT_SERVER,
      DEFAULT_SERVER
    );

    if (hasSession) {
      return (
        <ConnectedPanel
          apiUrl={values?.apiUrl ?? ''}
          isOauthSession={isOauthSession}
          oauthUserFullName={oauthUser?.userFullName ?? null}
          oauthInvalid={isOauthSession && credentialsCheck === 'invalid'}
          declaredProject={declaredProject}
          declaredProjectInaccessible={declaredProjectInaccessible}
          serverHost={serverHost}
          credentialsCheck={credentialsCheck}
          branchField={branchField}
          footer={footer}
        />
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

        {tab === 'login' && (
          <LoginTab
            projectDetected={projectDetected}
            serverOpen={serverOpen}
            serverField={serverField}
            serverHost={serverHost}
            serverLink={serverLink}
            connecting={connecting}
            connectError={connectError}
            onConnect={handleConnect}
            onOpenServerField={() => setServerOpen(true)}
          />
        )}

        {tab === 'apiKey' && (
          <ApiKeyTab
            serverField={serverField}
            apiKey={values?.apiKey || ''}
            onChangeApiKey={(apiKey) =>
              dispatch({ type: 'CHANGE_VALUES', payload: { apiKey } })
            }
            onKeyDown={handleKeyDown}
            apiKeyCheck={apiKeyCheck}
            canApply={canApplyApiKey}
            onApply={() => dispatch({ type: 'APPLY_VALUES' })}
            isInDevelopmentMode={isInDevelopmentMode}
          />
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
