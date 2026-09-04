import React from 'react';
import { Alert, Box, FormControl, TextField, Typography } from '@mui/material';

import { CredentialsCheck, isProjectInfo, ProjectOption } from './reducer';
import { POPUP_WIDTH } from '../constants';

type Props = {
  apiUrl: string;
  isOauthSession: boolean;
  oauthUserFullName: string | null;
  oauthInvalid: boolean;
  declaredProject: ProjectOption | null;
  declaredProjectInaccessible: boolean;
  serverHost: string;
  credentialsCheck: CredentialsCheck;
  branchField: React.ReactNode;
  footer: React.ReactNode;
};

// Shared by the API-key and OAuth branches: the project is fixed by the credentials either way.
const ProjectField = ({ name }: { name: string }) => (
  <FormControl fullWidth>
    <TextField
      label="Project"
      variant="outlined"
      size="small"
      value={name}
      InputProps={{ readOnly: true }}
    />
  </FormControl>
);

export const ConnectedPanel = ({
  apiUrl,
  isOauthSession,
  oauthUserFullName,
  oauthInvalid,
  declaredProject,
  declaredProjectInaccessible,
  serverHost,
  credentialsCheck,
  branchField,
  footer,
}: Props) => (
  <Box
    p={2}
    width={POPUP_WIDTH}
    style={{ display: 'flex', flexDirection: 'column', gap: 15 }}
  >
    <Typography variant="h6">Tolgee plugin</Typography>

    <FormControl fullWidth>
      <TextField
        label="Server"
        variant="outlined"
        size="small"
        value={apiUrl}
        InputProps={{ readOnly: true }}
      />
    </FormControl>

    {isOauthSession ? (
      <>
        {oauthInvalid ? (
          <Alert severity="warning" variant="outlined">
            Your session is no longer valid. Disconnect and connect again.
          </Alert>
        ) : (
          <Typography variant="caption" sx={{ color: 'success.main' }}>
            {oauthUserFullName
              ? `Connected as ${oauthUserFullName}`
              : 'Connected'}
          </Typography>
        )}
        {declaredProjectInaccessible ? (
          <Alert severity="error" variant="outlined">
            This site requests a project this session can't reach on{' '}
            {serverHost}. Either you don't have access to it, or a different
            project was chosen while signing in. Disconnect below and connect
            again to pick the right one.
          </Alert>
        ) : (
          declaredProject && <ProjectField name={declaredProject.name} />
        )}
      </>
    ) : (
      <>
        {isProjectInfo(credentialsCheck) ? (
          <ProjectField name={credentialsCheck.projectName} />
        ) : credentialsCheck === 'invalid' ? (
          <Typography variant="caption" sx={{ color: 'error.main' }}>
            Invalid API key
          </Typography>
        ) : null}
        {branchField}
      </>
    )}

    {footer}
  </Box>
);
