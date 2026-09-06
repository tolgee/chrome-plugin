import { describe, expect, it } from 'vitest';
import { connectedPanelProps } from './connectedPanelProps';
import { connectionHow } from './sessionCopy';
import { BranchOption, CredentialsCheck, ProjectOption } from './popupState';
import { LibConfig } from '../types';
import { Values } from './tools';

const libConfig = (protocolVersion?: number): LibConfig => ({
  uiPresent: true,
  protocolVersion,
  mode: 'production',
  config: { apiUrl: 'https://app.tolgee.io', apiKey: '' },
});

const projectCheck: CredentialsCheck = {
  projectName: 'Demo',
  projectId: 9,
  scopes: ['translations.edit'],
  branchingEnabled: false,
};

const values: Values = {
  apiUrl: 'https://app.tolgee.io',
  apiKey: 'tgpak_x',
  projectId: 9,
  projectKey: '9',
};

const base = {
  isOauthSession: false,
  siteKeyScreen: false,
  siteKey: undefined as string | undefined,
  activeValues: values,
  credentialsCheck: projectCheck,
  declaredProject: null as ProjectOption | null,
  branches: null as BranchOption[] | null,
  libConfig: libConfig(2),
};

describe('connectedPanelProps: session source x viewOnly', () => {
  it.each([
    ['own', undefined, false],
    ['own', undefined, true],
    ['override', 'tgpak_site', false],
    ['override', 'tgpak_site', true],
  ] as const)(
    'source %s with viewOnly %s reflects whether the checked scopes allow editing',
    (source, siteKey, viewOnly) => {
      const check: CredentialsCheck = {
        ...projectCheck,
        scopes: viewOnly ? ['keys.view'] : ['translations.edit'],
      };
      const { session } = connectedPanelProps({
        ...base,
        siteKey,
        credentialsCheck: check,
      });
      expect(session).toMatchObject({ kind: 'apiKey', source, viewOnly });
    }
  );

  it.each([false, true])(
    'source site with viewOnly %s comes from the site-key screen, not the stored key',
    (viewOnly) => {
      const check: CredentialsCheck = {
        ...projectCheck,
        scopes: viewOnly ? ['keys.view'] : ['translations.edit'],
      };
      const { session } = connectedPanelProps({
        ...base,
        siteKeyScreen: true,
        siteKey: 'tgpak_site',
        activeValues: null,
        credentialsCheck: check,
      });
      expect(session).toMatchObject({
        kind: 'apiKey',
        source: 'site',
        apiKey: 'tgpak_site',
        viewOnly,
      });
    }
  );
});

describe('connectedPanelProps: delivery is derived live from libConfig', () => {
  it('reports proxy once the SDK reports protocol 2', () => {
    const { session } = connectedPanelProps({
      ...base,
      activeValues: values,
      libConfig: libConfig(2),
    });
    expect(session).toMatchObject({ delivery: 'proxy' });
  });

  it('reports page for an SDK without proxy support', () => {
    const { session } = connectedPanelProps({
      ...base,
      activeValues: values,
      libConfig: libConfig(undefined),
    });
    expect(session).toMatchObject({ delivery: 'page' });
  });
});

describe('connectedPanelProps: OAuth session still loading its check', () => {
  it('reports no user name yet, which connectionHow renders as the nameless summary', () => {
    const { session } = connectedPanelProps({
      ...base,
      isOauthSession: true,
      credentialsCheck: 'loading',
      declaredProject: { id: 9, name: 'Demo', branchingEnabled: false },
    });
    expect(session).toEqual({ kind: 'oauth', userFullName: null });
    expect(connectionHow(session)).toBe(
      "You're signed in with your Tolgee account."
    );
  });
});

describe('connectedPanelProps: branch block', () => {
  it('collapses to null when there are no branches to offer', () => {
    const check: CredentialsCheck = { ...projectCheck, branchingEnabled: true };
    const { branch } = connectedPanelProps({
      ...base,
      credentialsCheck: check,
      branches: [],
    });
    expect(branch).toBeNull();
  });

  it('is present when branching is enabled and branches exist', () => {
    const check: CredentialsCheck = { ...projectCheck, branchingEnabled: true };
    const { branch } = connectedPanelProps({
      ...base,
      credentialsCheck: check,
      branches: [{ name: 'main', isDefault: true }],
    });
    expect(branch).not.toBeNull();
  });
});

describe('connectedPanelProps: projectUrl source', () => {
  it('is built from declaredProject.id on the OAuth path', () => {
    const { projectUrl } = connectedPanelProps({
      ...base,
      isOauthSession: true,
      credentialsCheck: 'loading',
      declaredProject: { id: 42, name: 'Declared', branchingEnabled: false },
    });
    expect(projectUrl).toBe('https://app.tolgee.io/projects/42');
  });

  it('is built from credentialsCheck.projectId on the key path, ignoring any declared project', () => {
    const { projectUrl } = connectedPanelProps({
      ...base,
      credentialsCheck: { ...projectCheck, projectId: 7 },
      declaredProject: { id: 42, name: 'Declared', branchingEnabled: false },
    });
    expect(projectUrl).toBe('https://app.tolgee.io/projects/7');
  });
});
