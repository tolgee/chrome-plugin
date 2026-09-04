import React, { useRef, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import { BranchOption } from './reducer';
import { branchEditorKeyAction } from './branch';

const LISTBOX_MAX_HEIGHT = 150;
// The option list floats over the rest of the popup, so nothing has to be reserved below the row.
export const BRANCH_EDITOR_LIST_SPACE = 0;

type Props = {
  value: string;
  options: BranchOption[];
  placeholder: string;
  onCommit: (branch: string) => void;
  onCancel: () => void;
};

export const BranchEditor = ({
  value,
  options,
  placeholder,
  onCommit,
  onCancel,
}: Props) => {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(true);
  // Enter can reach both the field's own handler and the Autocomplete's selection; only the first outcome counts.
  const settled = useRef(false);

  const commit = (branch: string) => {
    if (!settled.current) {
      settled.current = true;
      onCommit(branch);
    }
  };
  const cancel = () => {
    if (!settled.current) {
      settled.current = true;
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const highlighted = Boolean(
      (e.target as HTMLElement).getAttribute?.('aria-activedescendant')
    );
    const action = branchEditorKeyAction(e.key, highlighted);
    if (action === 'commit') {
      commit(input);
    } else if (action === 'cancel') {
      cancel();
    }
  };

  return (
    <Autocomplete
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      openOnFocus
      fullWidth
      freeSolo
      size="small"
      slotProps={{
        popper: {
          placement: 'bottom-start',
          modifiers: [
            { name: 'flip', enabled: false },
            {
              name: 'sameWidth',
              enabled: true,
              phase: 'beforeWrite',
              requires: ['computeStyles'],
              fn: ({ state }) => {
                state.styles.popper.width = `${state.rects.reference.width}px`;
              },
            },
          ],
          style: { zIndex: 1500 },
        },
      }}
      ListboxProps={{ style: { maxHeight: LISTBOX_MAX_HEIGHT } }}
      options={options}
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : option.name
      }
      value={options.find((b) => b.name === value) ?? (value || null)}
      inputValue={input}
      onInputChange={(_e, newInput) => setInput(newInput)}
      onChange={(_e, newValue, reason) => {
        if (reason === 'selectOption' || reason === 'createOption') {
          commit(
            typeof newValue === 'string' ? newValue : newValue?.name ?? ''
          );
        }
      }}
      renderOption={(props, option) => (
        <li {...props}>
          {option.name}
          {option.isDefault && (
            <span style={{ color: '#999', marginLeft: 6 }}>default</span>
          )}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus
          variant="outlined"
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onBlur={cancel}
          inputProps={{ ...params.inputProps, 'data-testid': 'branch-input' }}
        />
      )}
    />
  );
};
