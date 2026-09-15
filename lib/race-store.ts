import { getStore } from '@netlify/blobs';

/** Blobs 11 can report a conditional write as modified on an HTTP failure. */
export const checkedBlobFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  // The Blobs SDK passes lowercase methods; fetch accepts either case.
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (
    !response.ok &&
    ![304, 412].includes(response.status) &&
    !(response.status === 404 && ['GET', 'HEAD'].includes(method))
  )
    throw new Error(`Race storage returned HTTP ${response.status}.`);
  return response;
};
export const raceBlobStore = () =>
  getStore({
    name: 'frostbound-races',
    consistency: 'strong',
    fetch: checkedBlobFetch,
  });
