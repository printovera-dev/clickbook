// @ts-nocheck
// Web-only HTML shell (never used by iOS/Android builds). Carries SEO metadata alongside
// the existing PWA manifest, iOS standalone tags and service-worker registration.
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ClickBook",
    url: "https://clickbook.world/",
    logo: "https://clickbook.world/icons/icon-512.png",
    description:
      "Create beautifully printed photo albums and personalised photo books with ClickBook, a product of Printovera LLP.",
    parentOrganization: {
      "@type": "Organization",
      name: "Printovera LLP",
    },
  };

  return (
    <html lang="en-IN" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>Online Photo Album Maker &amp; Premium Photo Books | ClickBook</title>
        <meta
          name="description"
          content="Create beautiful wedding photo albums, family photo books and premium personalised albums online with ClickBook. Design, preview and order your memories across India."
        />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href="https://clickbook.world/" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ClickBook" />
        <meta property="og:locale" content="en_IN" />
        <meta
          property="og:title"
          content="Online Photo Album Maker &amp; Premium Photo Books | ClickBook"
        />
        <meta
          property="og:description"
          content="Turn your favourite photos into beautiful printed albums with ClickBook. Design, preview and order personalised photo books."
        />
        <meta property="og:url" content="https://clickbook.world/" />
        <meta property="og:image" content="https://clickbook.world/icons/icon-512.png" />
        <meta property="og:image:alt" content="ClickBook — personalised photo albums" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Online Photo Album Maker &amp; Premium Photo Books | ClickBook"
        />
        <meta
          name="twitter:description"
          content="Design, preview and order beautiful personalised photo albums with ClickBook."
        />
        <meta name="twitter:image" content="https://clickbook.world/icons/icon-512.png" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2B2B2E" />
        <meta name="application-name" content="ClickBook" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iOS standalone (hides Safari chrome when launched from the Home Screen) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ClickBook" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove ScrollViewStyleReset and
          set overflow: auto on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && location.protocol === 'https:') {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
                });
              }
              window.addEventListener('beforeinstallprompt', function (e) {
                e.preventDefault();
                window.__clickbookInstallPrompt = e;
                window.dispatchEvent(new Event('clickbook:installable'));
              });
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
