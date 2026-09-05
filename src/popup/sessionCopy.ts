import { CredentialDelivery } from '../types';

export type Session =
  | { kind: 'oauth'; userFullName: string | null }
  | {
      kind: 'apiKey';
      apiKey: string;
      source: 'own' | 'site' | 'override';
      viewOnly: boolean;
      delivery: CredentialDelivery;
    };

export const PAGE_DELIVERY_NOTE =
  "This site's SDK uses it directly; update @tolgee/web to keep it in the extension.";

export const PLUGIN_TITLE = 'Tolgee plugin';
export const API_KEY_TITLE = 'API key connection';

export const connectionTitle = (session: Session) =>
  session.kind === 'oauth' ? PLUGIN_TITLE : API_KEY_TITLE;

// A key the site ships in its own code keeps the page editable whatever the extension holds, so there is nothing an
// editing switch could truthfully say next to one.
export const hasEditingSwitch = (session: Session): boolean =>
  session.kind === 'oauth' || session.source === 'own';

export const connectionHow = (session: Session): string => {
  if (session.kind === 'oauth') {
    return session.userFullName
      ? `You're signed in as ${session.userFullName}.`
      : "You're signed in with your Tolgee account.";
  }
  switch (session.source) {
    case 'site':
      return 'This site connects with an API key from its own code.';
    case 'override':
      return withDeliveryNote(
        session,
        "You're connected with your own project API key, overriding the one in the site's code."
      );
    default:
      return withDeliveryNote(
        session,
        session.viewOnly
          ? "You're connected with a view-only API key."
          : "You're connected with a project API key."
      );
  }
};

const withDeliveryNote = (
  session: { delivery: CredentialDelivery },
  how: string
): string =>
  session.delivery === 'page' ? `${how} ${PAGE_DELIVERY_NOTE}` : how;

export const isViewOnly = (session: Session): boolean =>
  session.kind === 'apiKey' && session.viewOnly;

export const accountName = (session: Session): string => {
  if (session.kind === 'oauth') {
    return session.userFullName || 'Tolgee account';
  }
  return session.source === 'site'
    ? "API key from the site's code"
    : 'Project API key';
};

export const footerAction = (session: Session): string => {
  if (session.kind === 'oauth') {
    return 'Sign out';
  }
  return session.source === 'override' ? "Back to site's key" : 'Remove key';
};
