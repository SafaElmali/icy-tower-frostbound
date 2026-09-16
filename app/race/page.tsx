import { RaceGame } from '@/components/race-game';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/race');

export default function RacePage() {
  return <RaceGame />;
}
