// Only the connected page's own frame may receive OAuth credentials — a cross-origin iframe must not harvest the token.
// Origin-matched when the sender supplies the connected origin (background paths), else restricted to the top frame.
export const acceptsCredentialDelivery = (args: {
  currentOrigin: string;
  isTopFrame: boolean;
  pageOrigin?: string;
}): boolean =>
  args.pageOrigin ? args.currentOrigin === args.pageOrigin : args.isTopFrame;
