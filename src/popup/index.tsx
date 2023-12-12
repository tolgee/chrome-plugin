import { createMuiTheme, ThemeProvider } from '@material-ui/core';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { TolgeeDetector } from './TolgeeDetector';

const theme = createMuiTheme({
  palette: {
    primary: {
      main: '#EC407A',
    },
    secondary: {
      main: '#2B5582',
    },
  },
});

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <TolgeeDetector />
  </ThemeProvider>,
  document.getElementById('root')
);
