import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';

const theme = createTheme({
  palette: {
    primary: {
      main: '#EC407A',
    },
    secondary: {
      main: '#e0e0e0',
    },
  },
});

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Popup />
  </ThemeProvider>
);
