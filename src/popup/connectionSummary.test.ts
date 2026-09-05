import { describe, expect, it } from 'vitest';
import {
  accountName,
  connectionHow,
  footerAction,
  hasEditingSwitch,
  isViewOnly,
  PAGE_DELIVERY_NOTE,
  Session,
} from './connectionSummary';

const oauth: Session = { kind: 'oauth', userFullName: 'Jan Cizmar' };
const own: Session = {
  kind: 'apiKey',
  apiKey: 'tgpak_x',
  source: 'own',
  viewOnly: false,
  delivery: 'proxy',
};
const viewOnly: Session = { ...own, viewOnly: true };
const site: Session = { ...own, source: 'site' };
const override: Session = { ...own, apiKey: 'tgpak_y', source: 'override' };

describe('connectionHow', () => {
  it('names the signed-in user', () => {
    expect(connectionHow(oauth)).toBe("You're signed in as Jan Cizmar.");
  });

  it('falls back when the server reports no name', () => {
    expect(connectionHow({ kind: 'oauth', userFullName: null })).toBe(
      "You're signed in with your Tolgee account."
    );
  });

  it('says when the key can only view translations', () => {
    expect(connectionHow(viewOnly)).toBe(
      "You're connected with a view-only API key."
    );
    expect(isViewOnly(viewOnly)).toBe(true);
    expect(isViewOnly(own)).toBe(false);
    expect(isViewOnly(oauth)).toBe(false);
  });

  it('tells a stored key, the site key and an override apart', () => {
    expect(connectionHow(own)).toBe("You're connected with a project API key.");
    expect(connectionHow(site)).toBe(
      'This site connects with an API key from its own code.'
    );
    expect(connectionHow(override)).toBe(
      "You're connected with your own project API key, overriding the one in the site's code."
    );
  });

  it('says when the key was handed to the page for its old SDK, whatever the key', () => {
    expect(connectionHow({ ...own, delivery: 'page' })).toBe(
      `You're connected with a project API key. ${PAGE_DELIVERY_NOTE}`
    );
    expect(connectionHow({ ...viewOnly, delivery: 'page' })).toBe(
      `You're connected with a view-only API key. ${PAGE_DELIVERY_NOTE}`
    );
    expect(connectionHow({ ...override, delivery: 'page' })).toBe(
      `You're connected with your own project API key, overriding the one in the site's code. ${PAGE_DELIVERY_NOTE}`
    );
    expect(PAGE_DELIVERY_NOTE).toBe(
      "This site's SDK uses it directly; update @tolgee/web to keep it in the extension."
    );
  });

  it("does not repeat it for the site's own key, which the page always uses itself", () => {
    expect(connectionHow({ ...site, delivery: 'page' })).toBe(
      'This site connects with an API key from its own code.'
    );
  });
});

describe('accountName', () => {
  it('shows the user, or a placeholder without a name', () => {
    expect(accountName(oauth)).toBe('Jan Cizmar');
    expect(accountName({ kind: 'oauth', userFullName: null })).toBe(
      'Tolgee account'
    );
  });

  it('labels the site key as coming from the code', () => {
    expect(accountName(own)).toBe('Project API key');
    expect(accountName(override)).toBe('Project API key');
    expect(accountName(site)).toBe("API key from the site's code");
  });
});

describe('footerAction', () => {
  it('drops only the override on a page that carries its own key', () => {
    expect(footerAction(oauth)).toBe('Sign out');
    expect(footerAction(own)).toBe('Remove key');
    expect(footerAction(override)).toBe("Back to site's key");
  });
});

describe('hasEditingSwitch', () => {
  // Switching an override off hands the page back to the key the site ships, which keeps it editable: a switch
  // there would report editing as off while the page goes on editing into the site key's project.
  it('offers no switch wherever the site ships a key of its own', () => {
    expect(hasEditingSwitch(oauth)).toBe(true);
    expect(hasEditingSwitch(own)).toBe(true);
    expect(hasEditingSwitch(site)).toBe(false);
    expect(hasEditingSwitch(override)).toBe(false);
  });
});
