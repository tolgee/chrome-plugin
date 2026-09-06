import { describe, expect, it } from 'vitest';
import {
  connectButtonLabel,
  keyAllowsEditing,
  scopesAllowEditing,
  serverGearToggled,
  serverPanelOpen,
  siteKeyFromCode,
} from './apiKeyScreen';
import { LibConfig } from '../types';

const valid = {
  projectName: 'Acme Web',
  projectId: 3,
  scopes: ['translations.edit'],
  branchingEnabled: false,
};

describe('keyAllowsEditing', () => {
  it('needs a verified key carrying translations.edit', () => {
    expect(keyAllowsEditing(valid)).toBe(true);
    expect(keyAllowsEditing({ ...valid, scopes: ['translations.view'] })).toBe(
      false
    );
  });

  it('is false while the key is unverified', () => {
    expect(keyAllowsEditing(null)).toBe(false);
    expect(keyAllowsEditing('loading')).toBe(false);
    expect(keyAllowsEditing('invalid')).toBe(false);
    expect(keyAllowsEditing('unreachable')).toBe(false);
  });
});

describe('scopesAllowEditing', () => {
  it('needs translations.edit among the scopes', () => {
    expect(scopesAllowEditing(['translations.view', 'translations.edit'])).toBe(
      true
    );
    expect(scopesAllowEditing(['translations.view', 'keys.view'])).toBe(false);
    expect(scopesAllowEditing([])).toBe(false);
  });
});

describe('connectButtonLabel', () => {
  it('names the project once the key is verified', () => {
    expect(connectButtonLabel(valid)).toBe('Connect to Acme Web');
  });

  it('is a plain Connect otherwise', () => {
    expect(connectButtonLabel(null)).toBe('Connect');
    expect(connectButtonLabel('loading')).toBe('Connect');
    expect(connectButtonLabel('invalid')).toBe('Connect');
  });
});

describe('serverPanelOpen', () => {
  it('follows the gear', () => {
    expect(serverPanelOpen(true, false)).toBe(true);
    expect(serverPanelOpen(false, false)).toBe(false);
  });

  it('stays open while the server is not a usable URL', () => {
    expect(serverPanelOpen(false, true)).toBe(true);
  });
});

describe('serverGearToggled', () => {
  it('flips the panel on a usable server', () => {
    expect(serverGearToggled(false, false)).toBe(true);
    expect(serverGearToggled(true, false)).toBe(false);
  });

  it('keeps the panel toggled while the server is not a usable URL', () => {
    expect(serverGearToggled(true, true)).toBe(true);
    expect(serverGearToggled(false, true)).toBe(true);
  });
});

describe('siteKeyFromCode', () => {
  const page = (
    mode: LibConfig['mode'] | undefined,
    apiKey: string,
    legacyMode?: LibConfig['mode']
  ): LibConfig => ({
    uiPresent: true,
    mode: mode as LibConfig['mode'],
    config: { apiUrl: 'https://app.tolgee.io', apiKey, mode: legacyMode },
  });

  it('is the key of a development-mode page config', () => {
    expect(siteKeyFromCode(page('development', 'tgpak_x'))).toBe('tgpak_x');
  });

  it('reads the mode an older SDK reports inside the config', () => {
    expect(siteKeyFromCode(page(undefined, 'tgpak_x', 'development'))).toBe(
      'tgpak_x'
    );
  });

  it('is undefined for a production page or a page without a key', () => {
    expect(siteKeyFromCode(page('production', 'tgpak_x'))).toBeUndefined();
    expect(siteKeyFromCode(page('development', ''))).toBeUndefined();
    expect(siteKeyFromCode(null)).toBeUndefined();
  });
});
