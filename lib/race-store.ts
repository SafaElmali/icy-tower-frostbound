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
export const raceBlobStore = () => {
  const store = getStore({
    name: 'frostbound-races',
    consistency: 'strong',
    fetch: checkedBlobFetch,
  });
  return Object.assign(store, {
    async publishLobby(id: string, expiresAt: number) {
      await store.setJSON(
        `lobbies/${id}`,
        { id },
        {
          onlyIfNew: true,
          metadata: { expiresAt },
        },
      );
    },
    async *listPublicRooms() {
      for await (const page of store.list({
        prefix: 'lobbies/',
        paginate: true,
      }))
        yield page.blobs.map(({ key }) => key.slice('lobbies/'.length));
    },
  });
};
