import { nip19 } from 'nostr-tools';
import { useParams, Navigate } from 'react-router-dom';
import NotFound from './NotFound';

/**
 * Handles NIP-19 identifiers (npub1, nprofile1, etc.) at the root URL level.
 * For this app, npub/nprofile redirects to the user's scene view.
 */
export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
      // Redirect to the user's scene
      return <Navigate to={`/scene/${identifier}`} replace />;

    case 'nprofile': {
      // Convert to npub and redirect
      const npub = nip19.npubEncode(decoded.data.pubkey);
      return <Navigate to={`/scene/${npub}`} replace />;
    }

    default:
      return <NotFound />;
  }
}
