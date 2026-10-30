# EazyInvite brand asset bundle

Transparent logos, scalable SVG wrappers, high-resolution PNG exports, and favicon files based on the approved reference artwork and exact icon geometry.

## Main logo files

### `svg/` — website-friendly SVGs
- `eazyinvite-icon.svg` — standalone window icon (true vector paths).
- `eazyinvite-wordmark.svg` — EazyInvite wordmark only.
- `eazyinvite-logo.svg` — window icon + EazyInvite wordmark.
- `eazyinvite-stays-hotels.svg` — wordmark + divider + “STAYS & HOTELS”.
- `eazyinvite-lockup-stays-hotels.svg` — icon + wordmark + descriptor.

The wordmark artwork is embedded inside its SVG to preserve the exact approved letterforms and avoid font substitution. The window icon remains vector. The reference wordmark crop is high-resolution and transparent.

### `png/` — transparent raster logos
The same variants are available as PNG. `@2x.png` versions are supplied for high-density layouts. The standalone icon PNG is rendered at 480 × 600 px.

### `favicon/` — icon-only browser/app icons
- `favicon.svg` — scalable favicon.
- `favicon.ico` — multi-size ICO for browser tabs (16, 32, and 48 px entries).
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `favicon-64x64.png`.
- `favicon-180x180.png` and `apple-touch-icon.png` for Apple touch icons.
- `favicon-192x192.png` and `favicon-512x512.png` for app/PWA use.

## Brand colors
- Warm gold: `#8B7355`
- Dark brown: `#3A2F28`
- Sand accent: `#C9B99A`
- Suggested warm cream background: `#FAF8F5`

## Recommended use
- Desktop/mobile navbar and property pages: `svg/eazyinvite-logo.svg`.
- Small square brand placement: `svg/eazyinvite-icon.svg`.
- Footer, About page, partnerships: `svg/eazyinvite-stays-hotels.svg` or `svg/eazyinvite-lockup-stays-hotels.svg`.
- Browser tab and mobile home-screen icon: use files from `favicon/`.

## HTML favicon snippet

```html
<link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
<link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png" />
```

Website text can continue to use Cormorant Garamond and Space Grotesk as specified. The supplied logo artwork itself preserves its exact existing shapes.
