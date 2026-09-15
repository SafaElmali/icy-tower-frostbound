import type { Config } from '@netlify/functions';
import { raceBlobStore } from '../../lib/race-store.ts';

/** Rooms are inaccessible after one hour; remove their storage on the next sweep. */
export default async function cleanup() {
  const store = raceBlobStore();
  for await (const page of store.list({ prefix: 'rooms/', paginate: true })) {
    await Promise.all(
      page.blobs.map(async ({ key }) => {
        const item = await store.getMetadata(key);
        if (
          typeof item?.metadata.expiresAt === 'number' &&
          item.metadata.expiresAt <= Date.now()
        )
          await store.delete(key);
      }),
    );
  }
}
export const config: Config = { schedule: '@hourly' };
