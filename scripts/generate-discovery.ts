import { copyFile, writeFile } from 'node:fs/promises';
import { gameModes, gameplayFaq } from '../lib/game-guide.ts';
import {
  publicPages,
  REPOSITORY_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  siteUrl,
} from '../lib/seo.ts';

// Vinext's static export skips route handlers and dynamic metadata routes.
// Emit public assets before dev/build so both hosting targets serve these files.
async function generateDiscovery() {
  const text = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    'Independent Icy Tower-inspired browser prototype with no original game assets or affiliation. JavaScript and WebGL are required. No download or account is required.',
    '',
    '## Pages',
    '',
    ...publicPages.map(
      ({ path, title, description }) =>
        `- [${title}](${siteUrl(path)}): ${description}`,
    ),
    '',
    '## Controls',
    '',
    'Move with A/D or left/right arrows. Jump with Space, W, or up arrow. Release jump before jumping again. Pause solo play with Escape or P. Begin or retry with Enter. Touch screens provide left, right, and JUMP buttons.',
    '',
    '## Game modes',
    '',
    ...gameModes.map(({ name, description }) => `- ${name}: ${description}`),
    '',
    '## Frequently asked questions',
    '',
    ...gameplayFaq.flatMap(({ question, answer }) => [
      `### ${question}`,
      '',
      answer,
      '',
    ]),
    '## Source and credits',
    '',
    `- [Source repository](${REPOSITORY_URL}): Source code and development documentation.`,
    `- [Asset credits](${REPOSITORY_URL}/blob/main/public/assets/ATTRIBUTION.md): Character and art provenance.`,
    `- [Audio credits](${REPOSITORY_URL}/blob/main/public/audio/ATTRIBUTION.md): Audio sources and licenses.`,
    '',
  ].join('\n');

  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /.netlify/functions/',
    '',
    `Sitemap: ${siteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
  // Query-string challenges, daily seeds, and private invites canonicalize to
  // the public pages. Do not enumerate sessions or invent last-modified dates.
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...publicPages.map(
      ({ path }) => `  <url><loc>${siteUrl(path)}</loc></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

  await Promise.all(
    Object.entries({
      'llms.txt': text,
      'robots.txt': robots,
      'sitemap.xml': sitemap,
    }).map(([name, content]) =>
      writeFile(new URL(`../public/${name}`, import.meta.url), content),
    ),
  );
  await copyFile(
    new URL('../docs/images/frostbound-cover.png', import.meta.url),
    new URL('../public/frostbound-cover.png', import.meta.url),
  );
}

await generateDiscovery();
