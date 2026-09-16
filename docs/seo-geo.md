# Search and AI discovery

The public origin is `https://icy-tower-frostbound.netlify.app`. SEO (search engine optimization) and GEO (generative engine optimization) share the same foundation here: readable HTML, stable public URLs, accurate descriptions, and accessible crawl files.

## What is included

- `/`, `/how-to-play`, and `/race` have their own titles, descriptions, canonical URLs, Open Graph metadata, and Twitter summary cards. The existing promotional cover is used for sharing; it is not presented as a gameplay screenshot.
- The home page includes `WebSite` and `VideoGame` JSON-LD. The guide includes `FAQPage` JSON-LD generated from the same questions and answers rendered visibly on the page. No fabricated ratings, reviews, or publication dates are included.
- `/how-to-play` is rendered into HTML at build time, with controls, climbing tips, modes, multiplayer instructions, and FAQs. The title screen links to it with a normal anchor, so it is reachable without JavaScript. The game itself still requires JavaScript and WebGL.
- `/robots.txt` allows public pages and assets to be crawled and excludes API endpoints. Its wildcard rule applies to search and AI crawlers that respect robots.txt.
- `/sitemap.xml` lists the three canonical public pages. Daily towers, friend challenges, and race invites keep their functionality while their pages canonicalize to `/` or `/race`. No session URLs or fabricated last-modified timestamps are included.
- `/llms.txt` provides a supplemental plain-text index and game facts. It uses the same mode and FAQ content as the guide. This is an emerging convention, not a requirement for AI inclusion or a promise of ranking.

## Maintenance

Edit `lib/seo.ts` for the production origin, page registry, metadata, and game schema. Edit `lib/game-guide.ts` for shared mode and FAQ content; keep it aligned with the gameplay implementation. Add public pages to the registry and call `pageMetadata()` in their server page modules. Do not put private rooms or query-string variations into the registry.

`npm run dev`, `npm run build`, and `npm run build:netlify` automatically run `npm run seo:generate`. This produces ignored public assets from `scripts/generate-discovery.ts` and copies the existing cover from `docs/images` into the public directory. Use the npm commands rather than invoking `vinext` directly: this Vinext version skips route handlers and generated metadata routes in its static export. No new dependency or service is required.

After changing the origin, rebuild so metadata, structured data, and discovery files all use the new URL. Update the README's play link if the public domain changes.

## Verification and launch

Run `npm run typecheck` and `npm run build:netlify`. Inspect the HTML in `dist/client` for the page-specific canonical tags, share images, and JSON-LD. Confirm `robots.txt`, `sitemap.xml`, `llms.txt`, and `frostbound-cover.png` exist in that output. Check that every sitemap URL has a corresponding exported page, the FAQ schema matches visible answers, and invite query strings do not change canonical URLs.

After publishing, verify those URLs return HTTP 200 with the correct content types. Submit the sitemap in the site's verified Google Search Console and Bing Webmaster Tools properties and inspect the public pages. Those account actions are separate from this code change. Search engines decide whether and when to crawl, index, or cite the site.

References: [Google's AI features guidance](https://developers.google.com/search/docs/appearance/ai-features), [Schema.org VideoGame](https://schema.org/VideoGame), and the [llms.txt proposal](https://llmstxt.org/).
