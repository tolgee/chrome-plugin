import { Box, CircularProgress, Typography } from '@mui/material';
import { PLUGIN_TITLE } from './connectionSummary';
import { PopupFrame } from './PopupFrame';
import { State } from './popupState';

export const statusScreen = ({
  error,
  tolgeePresent,
  appliedValues,
}: Pick<State, 'error' | 'tolgeePresent' | 'appliedValues'>) => {
  if (error) {
    return (
      <PopupFrame title={PLUGIN_TITLE} testId="popup-error">
        <Typography variant="body2" fontWeight="bold" color="error">
          Error: {error}
        </Typography>
      </PopupFrame>
    );
  }
  if (tolgeePresent === 'loading') {
    return (
      <PopupFrame title={PLUGIN_TITLE} testId="popup-loading">
        <Box display="flex" justifyContent="center">
          <CircularProgress />
        </Box>
      </PopupFrame>
    );
  }
  if (tolgeePresent === 'present' || appliedValues) {
    return null;
  }
  return tolgeePresent === 'legacy' ? (
    <PopupFrame title={PLUGIN_TITLE} testId="popup-legacy">
      <Typography variant="body2">
        This website is using old version of Tolgee.
      </Typography>
    </PopupFrame>
  ) : (
    <PopupFrame title={PLUGIN_TITLE} testId="popup-not-present">
      <Typography variant="body2">
        This website doesn&apos;t seem to be using Tolgee.
      </Typography>
    </PopupFrame>
  );
};
