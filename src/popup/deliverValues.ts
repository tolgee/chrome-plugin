import { LibConfig } from '../types';
import { deliverToOrigin } from '../tabCredentials';
import { getActiveTabOrigin } from './activeTab';
import { sendMessage } from './sendMessage';
import { storeValues } from './storage';
import { pageCredentials, pageEditing, Values } from './tools';

type Slots = {
  storedValues: Values | null;
  appliedValues: Values | null;
  editingSwitchedOff: boolean;
};

export const syncToStorageAndPage = async (
  slots: Slots,
  libConfig: LibConfig | null
) => {
  // The page reloads as soon as it is told about the session and the SDK's first request then needs the worker to
  // find the origin record, so the record is written before the page hears anything.
  await storeValues(slots.storedValues);
  const pageOrigin = await getActiveTabOrigin();
  const credentials = {
    ...pageCredentials(slots.appliedValues, libConfig),
    editing: pageEditing(slots),
  };
  if (endsSessionForOrigin(slots) && pageOrigin) {
    await deliverToOrigin(pageOrigin, credentials);
    return;
  }
  await sendMessage('SET_CREDENTIALS', { ...credentials, pageOrigin });
};

// Removing the session or switching editing off ends it for the whole origin, so it has to reach every tab of it.
// A stored session merely restored here is a different thing: the other tabs may be using it, and clearing their
// slots would sign them out.
const endsSessionForOrigin = ({
  storedValues,
  appliedValues,
  editingSwitchedOff,
}: Slots) => !appliedValues && (!storedValues || editingSwitchedOff);

// Leaves the editing slot alone: the page it is written to has the session applied, so editing is on there.
export const redeliverToPage = async (
  values: Values,
  libConfig: LibConfig | null
) => {
  await sendMessage('SET_CREDENTIALS', {
    ...pageCredentials(values, libConfig),
    pageOrigin: await getActiveTabOrigin(),
  });
};
