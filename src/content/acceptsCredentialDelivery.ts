// Only the connected page's own frame may receive OAuth credentials — a cross-origin iframe must not harvest the token.
export const acceptsCredentialDelivery = (args: {
  currentOrigin: string;
  isTopFrame: boolean;
  pageOrigin?: string;
}): boolean =>
  args.pageOrigin ? args.currentOrigin === args.pageOrigin : args.isTopFrame;
