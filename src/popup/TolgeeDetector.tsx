import React, { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  FormControl,
  TextField,
  Typography,
} from '@mui/material';

import { useDetectorForm } from './useDetectorForm';
import {
  canApplyOnEnter,
  declaredProjectId,
  httpDisplayUrl,
  isOAuth,
  projectUrl,
  validateValues,
} from './tools';
import { sendToBackground } from './sendToBackground';
import { getActiveTab } from './activeTab';
import { safeOrigin } from '../oauth/url';
import { projectKeyFor } from '../oauth/sessionRules';
import { isApiKeyValid, useApiKeyCheck } from './useApiKeyCheck';
import { branchableProjectId, isOAuthUser, isProjectInfo } from './reducer';
import { ConnectedPanel, Session } from './ConnectedPanel';
import { LoginTab } from './LoginTab';
import { ApiKeyTab } from './ApiKeyTab';
import { PopupFrame } from './PopupFrame';

const DEFAULT_SERVER = 'https://app.tolgee.io';

export const TolgeeDetector = () => {
  const [state, dispatch] = useDetectorForm();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tab, setTab] = useState<'login' | 'apiKey'>('login');
  const [serverOpen, setServerOpen] = useState(false);

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

  const startLogin = async (apiUrl: string, projectId: number | undefined) => {
    setConnecting(true);
    setConnectError(null);
    try {
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

  const handleConnect = () =>
    startLogin(values?.apiUrl || DEFAULT_SERVER, declaredProjectId(libConfig));

  const activeValues = appliedValues || storedValues || values;
  const isOauthSession = isOAuth(activeValues);

  const handleDisconnect = async () => {
    try {
      if (isOauthSession) {
        const activeTab = await getActiveTab();
        await sendToBackground('OAUTH_LOGOUT', {
          pageOrigin: safeOrigin(activeTab?.url),
        });
      }
    } finally {
      dispatch({ type: 'CLEAR_ALL' });
    }
  };

  const handleSignInAgain = async () => {
    const apiUrl = activeValues?.apiUrl || DEFAULT_SERVER;
    const projectId = declaredProjectId(libConfig);
    await handleDisconnect();
    await startLogin(apiUrl, projectId);
  };

  const handleChangeBranch = (branch: string) => {
    dispatch({ type: 'CHANGE_VALUES', payload: { branch } });
    dispatch({ type: 'APPLY_VALUES' });
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

  if (error) {
    return (
      <PopupFrame title="Tolgee plugin">
        <Typography variant="body2" fontWeight="bold" color="error">
          Error: {error}
        </Typography>
      </PopupFrame>
    );
  } else if (tolgeePresent === 'loading') {
    return (
      <PopupFrame title="Tolgee plugin">
        <Box display="flex" justifyContent="center">
          <CircularProgress />
        </Box>
      </PopupFrame>
    );
  } else if (tolgeePresent === 'present' || appliedValues) {
    const declaredId = declaredProjectId(libConfig);
    const projectDetected = declaredId !== undefined;

    const { host: serverHost, link: serverLink } = httpDisplayUrl(
      values?.apiUrl || DEFAULT_SERVER,
      DEFAULT_SERVER
    );

    if (hasSession) {
      const session: Session = isOauthSession
        ? { kind: 'oauth', userFullName: oauthUser?.userFullName ?? null }
        : { kind: 'apiKey', apiKey: activeValues?.apiKey ?? '' };
      const projectName = isOauthSession
        ? declaredProject?.name ?? null
        : isProjectInfo(credentialsCheck)
          ? credentialsCheck.projectName
          : null;
      const projectId = isOauthSession
        ? declaredProject?.id
        : isProjectInfo(credentialsCheck)
          ? credentialsCheck.projectId
          : undefined;
      const branch =
        branchableProjectId(credentialsCheck, declaredProject) === null
          ? null
          : {
              override: activeValues?.branch || undefined,
              pageBranch: libConfig?.config?.branch || undefined,
              options: branches,
            };
      return (
        <ConnectedPanel
          session={session}
          serverHost={serverHost}
          sessionEnded={credentialsCheck === 'invalid'}
          apiKeyRejected={credentialsCheck === 'invalid'}
          projectName={projectName}
          projectUrl={projectUrl(activeValues?.apiUrl, projectId)}
          projectInaccessible={declaredProjectInaccessible}
          declaredProjectId={declaredId}
          branch={branch}
          editingOn={Boolean(appliedValues)}
          onToggleEditing={handleApplyChange}
          onChangeBranch={handleChangeBranch}
          onSignOut={handleDisconnect}
          onSignInAgain={handleSignInAgain}
        />
      );
    }
    return (
      <PopupFrame
        title={tab === 'apiKey' ? 'API key connection' : 'Tolgee plugin'}
      >
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
            onUseApiKey={() => setTab('apiKey')}
          />
        )}

        {tab === 'apiKey' && (
          <ApiKeyTab
            serverField={serverField}
            serverHost={serverHost}
            apiKey={values?.apiKey || ''}
            onChangeApiKey={(apiKey) =>
              dispatch({ type: 'CHANGE_VALUES', payload: { apiKey } })
            }
            onKeyDown={handleKeyDown}
            apiKeyCheck={apiKeyCheck}
            canApply={canApplyApiKey}
            onApply={() => dispatch({ type: 'APPLY_VALUES' })}
            onBack={() => setTab('login')}
            isInDevelopmentMode={isInDevelopmentMode}
          />
        )}
      </PopupFrame>
    );
  } else if (tolgeePresent === 'legacy') {
    return (
      <PopupFrame title="Tolgee plugin">
        <Typography variant="body2">
          This website is using old version of Tolgee.
        </Typography>
      </PopupFrame>
    );
  } else {
    return (
      <PopupFrame title="Tolgee plugin">
        <Typography variant="body2">
          This website doesn&apos;t seem to be using Tolgee.
        </Typography>
      </PopupFrame>
    );
  }
};
