// @ts-nocheck
// Web-only HTML shell (never used by iOS/Android builds). Carries the PWA manifest, iOS standalone meta tags and
// the service-worker registration so the web app can be installed via "Add to Home Screen".
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>ClickBook — Preserving Memories</title>
        <meta name="description" content="Create beautifully printed 8×8 inch photobooks in 60 seconds." />
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
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
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
