import { sendMessage } from './sendMessage';

export const loadConfig = async (): Promise<any> => {
  return new Promise((resolve, reject) => {
    let resolved = false;
    sendMessage('DETECT_TOLGEE').then((config: any) => {
      if (!resolved) {
        resolved = true;
        resolve(config);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject();
      }
    }, 1000);
  });
};

export const loadAppliedValues = async (): Promise<any> => {
  return new Promise((resolve, reject) => {
    let resolved = false;
    sendMessage('GET_CREDENTIALS').then((data: any) => {
      if (!resolved) {
        resolved = true;
        resolve(data);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject();
      }
    }, 1000);
  });
};
