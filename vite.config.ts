import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// Link-preview tags have to carry absolute URLs — a scraper reads the HTML
// without ever running our JS, so it can't work the origin out for itself.
// Each deployment stamps its own: without VITE_SITE_ORIGIN, dev would
// advertise production's card, which is a 404 until the branch merges.
const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN || 'https://anagrimoire.com';

const GAME_SLUGS = ['guess', 'scramble', 'hive', 'grid', 'boxed', 'weave', 'squares'];

// Panels that need an account — /stats, /settings, /account — are left out on
// purpose: real addresses, but nothing on them to index.
const SITEMAP_PATHS = [
  '/',
  ...GAME_SLUGS.flatMap((g) => [`/daily/${g}`, `/play/${g}`, `/solve/${g}`, `/learn/${g}`]),
  '/about',
  '/legal/notices',
  '/legal/privacy',
  '/legal/terms',
];

// When each page last changed, worked out by scripts/route-lastmod.mjs and
// committed. It used to be computed here with `git log`, which was wrong in a
// way only production showed: Render builds without usable history, so the
// call returned nothing and the sitemap shipped 33 URLs and no dates at all.
// Reading a file works wherever the build runs.
const LASTMOD: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync('data/route-lastmod.json', 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
})();

function sitemapXml(origin: string): string {
  const url = (p: string) => {
    // The dailies change every morning whatever the code did, so a commit date
    // would understate them — and a build date would be right for one day and
    // wrong for the rest. lastmod is optional per URL; omitting it is honest
    // where a claim wouldn't be, and changefreq still says what's true.
    const daily = p.startsWith('/daily/');
    const lastmod = daily ? null : (LASTMOD[p] ?? null);
    return [
      '  <url>',
      `    <loc>${origin}${p}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      `    <changefreq>${daily ? 'daily' : 'monthly'}</changefreq>`,
      '  </url>',
    ].join('\n');
  };
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_PATHS.map(url),
    '</urlset>',
    '',
  ].join('\n');
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-origin',
      transformIndexHtml: (html) => html.replaceAll('%SITE_ORIGIN%', SITE_ORIGIN),
    },
    {
      // A sitemap earns its keep here more than on most sites: every control in
      // the nav is a <button>, so a crawler landing on "/" has nothing to
      // follow and would never reach a single game. Generated rather than
      // committed, because the URLs carry this deployment's origin.
      //
      // Dev asks not to be indexed at all — it's a complete copy of production
      // on another hostname, which is duplicate content in the one way that
      // actually costs something.
      name: 'sitemap',
      apply: 'build',
      generateBundle() {
        const isProd = SITE_ORIGIN === 'https://anagrimoire.com';
        // A page the script doesn't know about, or a stale file, would just
        // quietly lose its date. Say so instead.
        const undated = SITEMAP_PATHS.filter((p) => !p.startsWith('/daily/') && !LASTMOD[p]);
        if (undated.length) this.warn(`no lastmod for ${undated.join(', ')} — run npm run lastmod`);
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(SITE_ORIGIN) });
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: isProd
            ? ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ''].join('\n')
            : ['User-agent: *', 'Disallow: /', ''].join('\n'),
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
