const SCOPE_LABELS: Record<string, string> = {
  'translations.view': 'View translations',
  'translations.edit': 'Edit translations',
  'translations.state-edit': 'Change translation state',
  'translations.suggest': 'Suggest translations',
  'translation-suggestions.own-access': 'Delete own suggestions',
  'translation-suggestions.manage': 'Manage suggestions',
  'keys.view': 'View keys',
  'keys.create': 'Create keys',
  'keys.edit': 'Edit keys',
  'screenshots.view': 'View screenshots',
  'screenshots.upload': 'Upload screenshots',
  'screenshots.delete': 'Delete screenshots',
};

export const scopeLabel = (scope: string): string =>
  SCOPE_LABELS[scope] ?? scope;
