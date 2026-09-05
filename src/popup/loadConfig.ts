import { sendMessage } from './sendMessage';
import { PageAppliedCredentials } from './tools';

export const loadAppliedValues = (): Promise<PageAppliedCredentials> =>
  Promise.race([
    sendMessage('GET_CREDENTIALS') as Promise<PageAppliedCredentials>,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('the content script did not answer in time')),
        1000
      )
    ),
  ]);
