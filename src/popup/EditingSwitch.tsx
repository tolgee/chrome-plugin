import { alpha, Box, Switch, Typography } from '@mui/material';

export const EditingSwitch = ({
  editingOn,
  disabled,
  keyProjectPending,
  branchOverride,
  onToggle,
}: {
  editingOn: boolean;
  disabled: boolean;
  keyProjectPending: boolean;
  branchOverride: string | undefined;
  onToggle: () => void;
}) => {
  const editingHint = keyProjectPending
    ? 'Checking the key…'
    : !editingOn
      ? 'You stay signed in. Turn it on to edit here.'
      : branchOverride
        ? `Edits go to ${branchOverride}.`
        : 'Alt+click any text on the page to edit it.';
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1.5}
      px={1.5}
      py={1.25}
      borderRadius={1.5}
      sx={{
        bgcolor: (theme) =>
          editingOn
            ? alpha(theme.palette.primary.main, 0.12)
            : theme.palette.action.hover,
      }}
    >
      <Switch
        size="small"
        checked={editingOn}
        disabled={disabled}
        onChange={onToggle}
        color="primary"
        data-testid="editing-switch"
        inputProps={
          {
            'data-testid': 'editing-switch-input',
          } as React.InputHTMLAttributes<HTMLInputElement>
        }
      />
      <Box minWidth={0}>
        <Typography
          variant="body2"
          fontWeight="medium"
          data-testid="editing-title"
        >
          {editingOn
            ? 'In-context editing on this page'
            : 'In-context editing off on this page'}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="editing-hint"
        >
          {editingHint}
        </Typography>
      </Box>
    </Box>
  );
};
