# EZPM landing page (getezpm.com)

This directory is served as `https://getezpm.com` via GitHub Pages.

## Files

- `index.html` — single-file landing page (no build step, no JS deps, all CSS inline)
- `favicon.svg` — favicon
- `CNAME` — GitHub Pages custom-domain config (`getezpm.com`)

## Enable GitHub Pages

In the GitHub UI for this repo (`Qureshi-Inc/ezpm`):

1. **Settings → Pages**.
2. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/docs`
3. Save.

GitHub will publish the site at `https://qureshi-inc.github.io/ezpm/` within ~60 seconds. Once your DNS is configured (next section), it'll also serve at `https://getezpm.com`.

## DNS — point getezpm.com at GitHub Pages

In your DNS provider (Cloudflare for the rest of Qureshi-Inc's domains):

**Apex (`getezpm.com`)** — four A records pointing at GitHub's Pages IPs:

```
@   A   185.199.108.153
@   A   185.199.109.153
@   A   185.199.110.153
@   A   185.199.111.153
```

**`www` subdomain** — one CNAME:

```
www   CNAME   qureshi-inc.github.io
```

GitHub Pages docs: <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>

## Cloudflare proxy

If you proxy `getezpm.com` through Cloudflare (orange cloud), Cloudflare handles TLS itself. Disable the GitHub Pages "Enforce HTTPS" toggle if you see a redirect loop — Cloudflare's edge is already terminating HTTPS and a second redirect from Pages can collide.

If you set the Cloudflare SSL/TLS mode to **Full (strict)**, GitHub Pages serves a valid Let's Encrypt cert on its origin and Cloudflare won't complain.

## Local preview

Just open `index.html` in a browser. Or:

```bash
cd docs/
python3 -m http.server 8080
open http://localhost:8080
```

## Editing

Single file. Open `index.html`, find the section you want to change, save. Push to `main`. GitHub Pages rebuilds in ~30 seconds.

Sections in order:

1. Topbar (`<header class="topbar">`)
2. Hero (`<section class="hero">`)
3. Proof row (`<section class="proof">`)
4. Features grid (`<section id="features">`)
5. Fees / pricing (`<section id="fees">`)
6. How it works (`<section id="how">`)
7. Stack (`<section id="stack">`)
8. Final CTA (`<section class="cta-final">`)
9. Footer (`<footer class="footer">`)

CSS variables live at the top of the `<style>` block (`:root { --accent: ... }`). Change `--accent` to retheme the whole page.
