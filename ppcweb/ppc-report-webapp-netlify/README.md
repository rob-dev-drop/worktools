# PPC Report Tool — Web (Netlify)

A single-page React app for analyzing Amazon PPC SP/SB reports (.xlsx). Built with Vite + Tailwind.

## Local dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Build output goes to `dist/`.

## Deploy to Netlify

### Option A: Netlify UI
1. Create a new site from Git (GitHub/GitLab/Bitbucket) or drag-and-drop the built `dist` folder.
2. If using Git:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. The included `netlify.toml` already sets these and adds an SPA redirect.

### Option B: Netlify CLI
```bash
npm install -g netlify-cli
netlify init        # link site (choose "Create & configure a new site")
netlify deploy --build --prod
```

This will run `npm run build` and publish the `dist` folder.

No server, keys, or environment variables needed. Files are processed entirely in the browser.
