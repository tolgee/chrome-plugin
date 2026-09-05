import React, { useEffect, useState } from 'react';
import { useDetectorForm } from './useDetectorForm';
import {
  activeValuesOf,
  canApplyOnEnter,
  declaredProjectId,
  isOAuth,
} from './tools';
import { httpDisplayUrl, isHttpUrl } from '../oauth/url';
import { sdkTooOldFor } from './delivery';
import { serverGearToggled, serverPanelOpen } from './apiKeyScreen';
import { ConnectedPanel } from './ConnectedPanel';
import { LoginTab } from './LoginTab';
import { useOAuthConnect } from './useOAuthConnect';
import { useApiKeyConnect } from './useApiKeyConnect';
import { useDisconnect } from './useDisconnect';
import { connectedPanelProps } from './connectedPanelProps';
import { ApiKeyTab } from './ApiKeyTab';
import { PopupFrame } from './PopupFrame';
import { ServerPanel } from './ServerPanel';
import { statusScreen } from './statusScreen';
import { API_KEY_TITLE, PLUGIN_TITLE } from './connectionSummary';
import { keyProjectPending } from './popupState';

const DEFAULT_SERVER = 'https://app.tolgee.io';

export const Popup = () => {
  const [state, dispatch] = useDetectorForm();
  const [tab, setTab] = useState<'login' | 'apiKey'>('login');
  const [serverToggled, setServerToggled] = useState(false);

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
    connectRefusal,
  } = state;

  const activeValues = activeValuesOf({ values, storedValues, appliedValues });
  const isOauthSession = isOAuth(activeValues);
  const declaredId = declaredProjectId(libConfig);

  const apiKeyConnect = useApiKeyConnect({
    values,
    storedValues,
    appliedValues,
    libConfig,
    onApiKeyTab: tab === 'apiKey',
    dispatch,
    onUseAnotherKey: () => setTab('apiKey'),
  });
  const { hasSession, siteKey, siteKeyScreen, apiKeyCheck, canApplyApiKey } =
    apiKeyConnect;
  const { disconnect } = useDisconnect(
    dispatch,
    isOauthSession,
    apiKeyConnect.clearOverride
  );
  const { connect, signInAgain, connecting, connectError, dismissRefusal } =
    useOAuthConnect(dispatch, disconnect, libConfig);

  const server = values?.apiUrl || DEFAULT_SERVER;
  const serverInvalid = !isHttpUrl(server);
  const serverOpen = serverPanelOpen(serverToggled, serverInvalid);

  useEffect(() => {
    if (values?.apiKey && !values?.oauth) {
      setTab('apiKey');
    }
  }, [values?.apiKey, values?.oauth]);

  const handleToggleEditing = () => {
    dispatch({
      type: appliedValues ? 'SWITCH_EDITING_OFF' : 'SWITCH_EDITING_ON',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key === 'Enter' &&
      canApplyOnEnter(hasSession, tab, values, canApplyApiKey)
    ) {
      if (hasSession) {
        dispatch({ type: 'APPLY_VALUES' });
      } else {
        apiKeyConnect.applyApiKey();
      }
    }
  };

  const handleChangeBranch = (branch: string) => {
    dispatch({ type: 'CHANGE_VALUES', payload: { branch } });
    dispatch({ type: 'APPLY_VALUES' });
  };

  const status = statusScreen({ error, tolgeePresent, appliedValues });
  if (status) {
    return status;
  }

  const sdkTooOld = sdkTooOldFor({
    libConfig,
    hasSession,
    siteKeyScreen,
    activeValues,
  });
  const { host: serverHost, link: serverLink } = httpDisplayUrl(
    server,
    DEFAULT_SERVER
  );

  if (hasSession || siteKeyScreen) {
    return (
      <ConnectedPanel
        {...connectedPanelProps({
          isOauthSession,
          siteKeyScreen,
          siteKey,
          activeValues,
          credentialsCheck,
          declaredProject,
          branches,
          libConfig,
        })}
        serverHost={serverHost}
        credentialRejected={credentialsCheck === 'invalid'}
        projectInaccessible={declaredProjectInaccessible}
        declaredProjectId={declaredId}
        sdkTooOld={sdkTooOld}
        checkingKey={keyProjectPending(activeValues, credentialsCheck)}
        editingOn={Boolean(appliedValues)}
        onToggleEditing={handleToggleEditing}
        onChangeBranch={handleChangeBranch}
        onSignOut={disconnect}
        onSignInAgain={() =>
          signInAgain(activeValues?.apiUrl || DEFAULT_SERVER, declaredId)
        }
        onUseAnotherKey={apiKeyConnect.useAnotherKey}
      />
    );
  }
  return (
    <PopupFrame
      title={tab === 'apiKey' ? API_KEY_TITLE : PLUGIN_TITLE}
      testId="sign-in-screen"
      serverSettings={{
        open: serverOpen,
        onToggle: () =>
          setServerToggled(serverGearToggled(serverOpen, serverInvalid)),
        panel: (
          <ServerPanel
            value={values?.apiUrl ?? ''}
            placeholder={DEFAULT_SERVER}
            invalid={serverInvalid}
            onChange={(apiUrl) =>
              dispatch({ type: 'CHANGE_VALUES', payload: { apiUrl } })
            }
            onKeyDown={handleKeyDown}
          />
        ),
      }}
    >
      {tab === 'login' && (
        <LoginTab
          projectDetected={declaredId !== undefined}
          sdkTooOld={sdkTooOld}
          serverHost={serverHost}
          serverLink={serverLink}
          serverInvalid={serverInvalid}
          connecting={connecting}
          connectError={connectError ?? connectRefusal}
          onDismissRefusal={dismissRefusal}
          onConnect={() => connect(server, declaredId)}
          onUseApiKey={() => setTab('apiKey')}
        />
      )}
      {tab === 'apiKey' && (
        <ApiKeyTab
          serverHost={serverHost}
          serverLink={serverLink}
          apiKey={values?.apiKey || ''}
          onChangeApiKey={(apiKey) =>
            dispatch({ type: 'CHANGE_VALUES', payload: { apiKey } })
          }
          onKeyDown={handleKeyDown}
          apiKeyCheck={apiKeyCheck}
          canApply={canApplyApiKey}
          onApply={apiKeyConnect.applyApiKey}
          onBack={() => setTab('login')}
        />
      )}
    </PopupFrame>
  );
};
