# Kanzaler — Starfield Portfolio

A bilingual, animated personal homepage built with Astro and deployed to GitHub Pages.

## Local development

```bash
npm install
npm run sync:github
npm run prepare:music -- "C:\\path\\to\\source.flac"
npm run dev
```

The source FLAC stays outside the repository. Only the generated `public/audio/star-moon-fields.mp3` is published.

## Content

- Edit bilingual profile and featured cards in `src/content/site.ts`.
- Add Markdown or MDX notes under `src/content/notes/`.
- Add a `repo` name to a featured project to merge live metadata from the build-time GitHub snapshot.

## Quality checks

```bash
npm run check
npm run build
npm test
```

Pushes to `main`, manual workflow runs, and the daily schedule publish the site through GitHub Pages.
