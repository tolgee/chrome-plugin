import { State } from './popupState';
import { compareValues, validateValues, Values } from './tools';

// Only the values a credentials check can actually run against: none of storedValues/appliedValues/libConfig alone
// once they disagree with what is currently stored, since the reducer hasn't reconciled them yet at that point.
export const checkableValuesOf = (
  state: Pick<State, 'libConfig' | 'storedValues' | 'appliedValues'>
): Values | null => {
  const { libConfig, storedValues, appliedValues } = state;
  const valuesToCompare =
    appliedValues || storedValues || (libConfig?.config as Values);
  return !storedValues || compareValues(valuesToCompare, storedValues)
    ? validateValues(valuesToCompare)
    : null;
};
