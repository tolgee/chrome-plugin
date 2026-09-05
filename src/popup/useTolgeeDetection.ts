/* eslint-disable react-hooks/exhaustive-deps */
import browser, { type Runtime } from 'webextension-polyfill';
import { Dispatch, useEffect } from 'react';
import { LibConfig } from '../types';
import { RuntimeMessage } from '../content/Messages';
import { getActiveTab } from './activeTab';
import { sendMessage } from './sendMessage';
import { Action } from './popupState';

const DETECT_TIMEOUT_MS = 15_000;
const DETECT_INITIAL_DELAY_MS = 250;
const DETECT_MAX_DELAY_MS = 1_500;
const NOT_DETECTED_MS = 300;

export const useTolgeeDetection = (
  libConfig: LibConfig | null,
  dispatch: Dispatch<Action>
) => {
  useEffect(() => {
    let cancelled = false;
    // Applying/un-applying reloads the page, so the content script is briefly gone. A dev-server page (vite) can
    // take well over 4 s to get it back, so keep asking for a while before giving up.
    const detect = (waitedMs: number, delayMs: number) => {
      sendMessage('DETECT_TOLGEE').catch(() => {
        if (cancelled) {
          return;
        }
        if (waitedMs < DETECT_TIMEOUT_MS) {
          setTimeout(
            () =>
              detect(
                waitedMs + delayMs,
                Math.min(delayMs * 1.5, DETECT_MAX_DELAY_MS)
              ),
            delayMs
          );
          return;
        }
        dispatch({
          type: 'SET_ERROR',
          payload: 'No access to this page, try to refresh',
        });
      });
    };
    detect(0, DETECT_INITIAL_DELAY_MS);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!libConfig) {
      const timer = setTimeout(
        () =>
          dispatch({
            type: 'CHANGE_LIB_CONFIG',
            payload: { frameId: null, libData: null },
          }),
        NOT_DETECTED_MS
      );
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [libConfig]);

  useEffect(() => {
    let cancelled = false;
    let activeTabId: number | undefined;
    // Content scripts broadcast with runtime.sendMessage, so every tab's handshake lands here; only the tab the
    // popup was opened on may drive its state.
    getActiveTab().then((tab) => {
      activeTabId = tab?.id;
    });
    const listener = (message: unknown, sender: Runtime.MessageSender) => {
      const { type, data } = message as RuntimeMessage;
      if (cancelled || type !== 'TOLGEE_CONFIG_LOADED') {
        return undefined;
      }
      if (activeTabId === undefined || sender.tab?.id !== activeTabId) {
        return undefined;
      }
      dispatch({
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: data, frameId: sender.frameId ?? null },
      });
      return undefined;
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);
};
