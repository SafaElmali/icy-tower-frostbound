import type { Metadata } from 'next';

// Keep the public origin stable across local builds and deploy previews.
export const SITE_URL = 'https://icy-tower-frostbound.netlify.app';
export const SITE_NAME = 'Icy Tower — Frostbound';
export const SITE_DESCRIPTION =
  'Play Icy Tower — Frostbound, a free browser tower-climbing game. Chain jumps, outrun rising frost, try daily towers, or race a friend. No download needed.';
export const REPOSITORY_URL =
  'https://github.com/SafaElmali/icy-tower-frostbound';

export const publicPages = [
  {
    path: '/',
    title: 'Icy Tower — Frostbound | Free Browser Game',
    description: SITE_DESCRIPTION,
  },
  {
    path: '/how-to-play',
    title: 'How to Play Icy Tower — Frostbound | Controls & Game Modes',
    description:
      'Learn Frostbound controls, momentum jumps, combos, Classic, Party and Practice modes, daily towers, and 2–4 player races. Read the gameplay FAQ.',
  },
  {
    path: '/race',
    title: 'Race a Friend | Icy Tower — Frostbound',
    description:
      'Play a private 2–4 player tower race in your browser. Invite a friend, choose a finish floor, and climb with checkpoints and optional shoves.',
  },
] as const;

export type PublicPath = (typeof publicPages)[number]['path'];

export function siteUrl(path = '/') {
  return new URL(path, SITE_URL).href;
}

export function pageMetadata(path: PublicPath): Metadata {
  const page = publicPages.find((entry) => entry.path === path)!;
  const image = {
    url: siteUrl('/frostbound-cover.png'),
    width: 1774,
    height: 887,
    alt: 'Icy Tower — Frostbound cover artwork: a climber jumping through a frozen cathedral',
  };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: siteUrl(path) },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      url: siteUrl(path),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}

export const gameStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': siteUrl('/#website'),
      url: siteUrl(),
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
    },
    {
      '@type': 'VideoGame',
      '@id': siteUrl('/#game'),
      name: SITE_NAME,
      url: siteUrl(),
      description: SITE_DESCRIPTION,
      image: siteUrl('/frostbound-cover.png'),
      genre: ['Arcade', 'Platformer'],
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any operating system with a WebGL-capable browser',
      gamePlatform: 'Web browser',
      isAccessibleForFree: true,
      inLanguage: 'en',
      playMode: [
        'https://schema.org/SinglePlayer',
        'https://schema.org/MultiPlayer',
      ],
      numberOfPlayers: {
        '@type': 'QuantitativeValue',
        minValue: 1,
        maxValue: 2,
      },
      sameAs: REPOSITORY_URL,
      gameTip: {
        '@type': 'CreativeWork',
        name: 'Frostbound gameplay guide',
        url: siteUrl('/how-to-play'),
      },
    },
  ],
};

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
