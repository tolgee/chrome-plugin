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
import { SignInScreen } from './SignInScreen';
import { useOAuthConnect } from './useOAuthConnect';
import { useApiKeyConnect } from './useApiKeyConnect';
import { useDisconnect } from './useDisconnect';
import { connectedPanelProps } from './connectedPanelProps';
import { StatusScreen } from './StatusScreen';
import { statusFor } from './status';
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

  const status = statusFor({ error, tolgeePresent, appliedValues });
  if (status) {
    return <StatusScreen status={status} error={error} />;
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
        credentialsCheckInvalid={credentialsCheck === 'invalid'}
        projectInaccessible={declaredProjectInaccessible}
        declaredProjectId={declaredId}
        sdkTooOld={sdkTooOld}
        keyProjectPending={keyProjectPending(activeValues, credentialsCheck)}
        editingOn={Boolean(appliedValues)}
        onToggleEditing={handleToggleEditing}
        onChangeBranch={handleChangeBranch}
        onSignOut={disconnect}
        onSignInAgain={() =>
          signInAgain(activeValues?.apiUrl || DEFAULT_SERVER, declaredId)
        }
        onUseAnotherKey={apiKeyConnect.switchToAnotherKey}
      />
    );
  }
  return (
    <SignInScreen
      tab={tab}
      onChangeTab={setTab}
      serverOpen={serverOpen}
      onToggleServer={() =>
        setServerToggled(serverGearToggled(serverOpen, serverInvalid))
      }
      serverInvalid={serverInvalid}
      serverValue={values?.apiUrl ?? ''}
      defaultServer={DEFAULT_SERVER}
      onChangeServer={(apiUrl) =>
        dispatch({ type: 'CHANGE_VALUES', payload: { apiUrl } })
      }
      onKeyDown={handleKeyDown}
      declaredId={declaredId}
      sdkTooOld={sdkTooOld}
      serverHost={serverHost}
      serverLink={serverLink}
      connecting={connecting}
      connectError={connectError ?? connectRefusal}
      onDismissRefusal={dismissRefusal}
      onConnect={() => connect(server, declaredId)}
      apiKey={values?.apiKey || ''}
      onChangeApiKey={(apiKey) =>
        dispatch({ type: 'CHANGE_VALUES', payload: { apiKey } })
      }
      apiKeyCheck={apiKeyCheck}
      canApplyApiKey={canApplyApiKey}
      onApplyApiKey={apiKeyConnect.applyApiKey}
    />
  );
};
