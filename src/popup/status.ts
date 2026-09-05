import { State } from './popupState';

export type Status = 'error' | 'loading' | 'legacy' | 'not_present';

export const statusFor = ({
  error,
  tolgeePresent,
  appliedValues,
}: Pick<State, 'error' | 'tolgeePresent' | 'appliedValues'>): Status | null => {
  if (error) {
    return 'error';
  }
  if (tolgeePresent === 'loading') {
    return 'loading';
  }
  if (tolgeePresent === 'present' || appliedValues) {
    return null;
  }
  return tolgeePresent === 'legacy' ? 'legacy' : 'not_present';
};
