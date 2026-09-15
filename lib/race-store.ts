import { getStore } from '@netlify/blobs';

/** Blobs 11 can report a conditional write as modified on an HTTP failure. */
export const checkedBlobFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const method =
    init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (
    !response.ok &&
    ![304, 412].includes(response.status) &&
    !(response.status === 404 && method === 'GET')
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
