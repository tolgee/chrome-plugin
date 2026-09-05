import React from 'react';
import { ApiKeyTab } from './ApiKeyTab';
import { LoginTab } from './LoginTab';
import { PopupFrame } from './PopupFrame';
import { ServerPanel } from './ServerPanel';
import { ConnectError } from './useOAuthConnect';
import { CredentialsCheck } from './popupState';
import { API_KEY_TITLE, PLUGIN_TITLE } from './connectionSummary';

type Props = {
  tab: 'login' | 'apiKey';
  onChangeTab: (tab: 'login' | 'apiKey') => void;
  serverOpen: boolean;
  onToggleServer: () => void;
  serverInvalid: boolean;
  serverValue: string;
  defaultServer: string;
  onChangeServer: (apiUrl: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  declaredId: number | undefined;
  sdkTooOld: boolean;
  serverHost: string;
  serverLink: string;
  connecting: boolean;
  connectError: ConnectError | null;
  onDismissRefusal: () => void;
  onConnect: () => void;
  apiKey: string;
  onChangeApiKey: (value: string) => void;
  apiKeyCheck: CredentialsCheck;
  canApplyApiKey: boolean;
  onApplyApiKey: () => void;
};

export const SignInScreen = ({
  tab,
  onChangeTab,
  serverOpen,
  onToggleServer,
  serverInvalid,
  serverValue,
  defaultServer,
  onChangeServer,
  onKeyDown,
  declaredId,
  sdkTooOld,
  serverHost,
  serverLink,
  connecting,
  connectError,
  onDismissRefusal,
  onConnect,
  apiKey,
  onChangeApiKey,
  apiKeyCheck,
  canApplyApiKey,
  onApplyApiKey,
}: Props) => (
  <PopupFrame
    title={tab === 'apiKey' ? API_KEY_TITLE : PLUGIN_TITLE}
    testId="sign-in-screen"
    serverSettings={{
      open: serverOpen,
      onToggle: onToggleServer,
      panel: (
        <ServerPanel
          value={serverValue}
          placeholder={defaultServer}
          invalid={serverInvalid}
          onChange={onChangeServer}
          onKeyDown={onKeyDown}
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
        connectError={connectError}
        onDismissRefusal={onDismissRefusal}
        onConnect={onConnect}
        onUseApiKey={() => onChangeTab('apiKey')}
      />
    )}
    {tab === 'apiKey' && (
      <ApiKeyTab
        serverHost={serverHost}
        serverLink={serverLink}
        apiKey={apiKey}
        onChangeApiKey={onChangeApiKey}
        onKeyDown={onKeyDown}
        apiKeyCheck={apiKeyCheck}
        canApply={canApplyApiKey}
        onApply={onApplyApiKey}
        onBack={() => onChangeTab('login')}
      />
    )}
  </PopupFrame>
);
