import { sendMessage } from './sendMessage';
import { PageCredentials } from '../content/credentialSink';

export const loadAppliedValues = (): Promise<PageCredentials> =>
  Promise.race([
    sendMessage('GET_CREDENTIALS') as Promise<PageCredentials>,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('the content script did not answer in time')),
        1000
      )
    ),
  ]);
