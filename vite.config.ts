import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';
import hostingConfig from './.openai/hosting.json';
import {
  isJevDevelopmentEnabled,
  jevDevelopmentServer,
} from './lib/jev-dev-server';
import { raceDevelopmentServer } from './lib/race-dev-server';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async (configEnv) => {
  const jevEnabled = isJevDevelopmentEnabled(
    configEnv,
    loadEnv(configEnv.mode, process.cwd(), 'JEV_').JEV_ENABLED,
    process.env.NODE_ENV,
  );
  const buildDefines = {
    'import.meta.env.JEV_ENABLED': JSON.stringify(jevEnabled),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VITE_APP_VERSION ||
        process.env.COMMIT_REF ||
        process.env.GITHUB_SHA ||
        '0.1.0',
    ),
    'import.meta.env.VITE_APP_ENV': JSON.stringify(
      process.env.VITE_APP_ENV ||
        process.env.CONTEXT ||
        (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    ),
  };
  // The game runs entirely in the browser; Netlify serves a static export.
  if (process.env.DEPLOY_TARGET === 'netlify') {
    return {
      define: buildDefines,
      css: { postcss: { plugins: [tailwindcss()] } },
      plugins: [
        jevDevelopmentServer(jevEnabled),
        raceDevelopmentServer(),
        vinext(),
      ],
    };
  }
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    define: buildDefines,
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      jevDevelopmentServer(jevEnabled),
      raceDevelopmentServer(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
