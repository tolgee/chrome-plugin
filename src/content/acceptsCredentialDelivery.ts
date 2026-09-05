// Only the connected page's own frame may receive the session/api-key delivery — a cross-origin iframe must not receive it.
export const acceptsCredentialDelivery = (args: {
  currentOrigin: string;
  isTopFrame: boolean;
  pageOrigin?: string;
}): boolean =>
  args.pageOrigin ? args.currentOrigin === args.pageOrigin : args.isTopFrame;
