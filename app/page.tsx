import Game from './game';
import { gameStructuredData, pageMetadata, serializeJsonLd } from '@/lib/seo';

export const metadata = pageMetadata('/');

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(gameStructuredData),
        }}
      />
      <Game />
    </>
  );
}
