import type { ProxyBody, ProxyErrorKind } from '../protocol';
import type { StoredSession } from '../oauth/tokenStore';

export type ProxyResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string | null>;
  body: string;
};

export type ProxyFailure = {
  error: { kind: ProxyErrorKind; message: string };
};

export type ProxyResult = { response: ProxyResponse } | ProxyFailure;

export type ApiRequestData = {
  id?: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: ProxyBody;
  apiUrl?: string;
  projectKey?: string;
  pageOrigin?: string;
};

export type ScreenshotUploadData = Pick<
  ApiRequestData,
  'id' | 'apiUrl' | 'projectKey'
>;

export type Connection = { apiUrl: string; projectKey: string };

export type Credential = { bearer: string } | { apiKey: string };

export type LocatedSession = { connection: Connection } & (
  | { kind: 'oauth'; session: StoredSession }
  | { kind: 'apiKey'; apiKey: string }
);

export type Gate = LocatedSession & { credential: Credential };

export type AuthorizedRequest = {
  method: string;
  headers: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
};

export const failure = (
  kind: ProxyErrorKind,
  message: string
): ProxyFailure => ({
  error: { kind, message },
});
