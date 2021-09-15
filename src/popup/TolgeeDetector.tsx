import React, { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@material-ui/core';

import { PopupMessages } from './PopupMessages';

export const TolgeeDetector = () => {
  const [ready, setReady] = useState(undefined);

  useEffect(() => {
    let closureReady = ready;
    PopupMessages.send('DETECT_TOLGEE').then((isPresent: any) => {
      setReady(Boolean(isPresent));
      closureReady = true;
    });

    setTimeout(() => {
      if (!closureReady) {
        setReady(false);
      }
    }, 1000);
  }, []);

  if (ready === undefined) {
    return (
      <Box width="300px" p={1} display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  } else if (ready === true) {
    return (
      <Box width="300px" p={2}>
        This website is using Tolgee!
      </Box>
    );
  } else {
    return (
      <Box width="300px" p={2}>
        This website doesn't seem to be using Tolgee.
      </Box>
    );
  }
};
