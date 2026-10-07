# Opus 5.5 and interactive answers for everyone

An unofficial concept page: what it looks like when Claude Opus 5.5 answers with interfaces you can use, not just paragraphs.

- Live: https://thevibeworks.github.io/opus-5-5-for-everyone/

Not an Anthropic announcement. Not affiliated with Anthropic or OpenAI. The layout follows OpenAI's
[GPT-6 and Intelligent UI for everyone](https://openai.com/index/gpt-6-for-everyone/) (October 7, 2026);
all text, illustrations and interactives are original.

## What's on the page

Every interactive was written by Claude Opus 5.5 in one Claude Code session, as plain HTML, CSS and JavaScript.

| Section | Demo |
| --- | --- |
| Hero | Text answer that turns into an exploded, isometric keyboard diagram as you scroll |
| Everyday questions | Text-only vs interactive answer, side by side: 10K training plan, two job offers, a Kyoto weekend |
| Learn hard ideas | Central limit theorem sampler, consistent-hashing ring, TCP Reno congestion-window sim |
| Build a tool | Bill splitter (cent-exact rounding), savings calculator, brick breaker |
| Answers that start sooner | Simulated side-by-side: think-then-answer vs answer-while-thinking |
| Throughout | A scroll-scrubbed "Opus 5.5" cursor that marks, circles, types and drags words in the essay as you read (off with reduced motion) |
| Top bar | A Claude Code style status line that reads along: spinner, verb per section, seconds, tokens read. Esc really interrupts it |
| Ending | More from thevibeworks, and a sticker the cursor drags in |

## Layout

```
site/
  index.html     page and static copy
  styles.css     design tokens and component styles
  app.js         page behavior and every widget (no dependencies)
  fonts/         self-hosted Source Serif 4, IBM Plex Sans/Mono (SIL OFL, licenses alongside)
  _headers       security headers for hosts that read it (e.g. Cloudflare)
  og.png         social preview
```

No build step, no framework, no third-party requests. The CSP lives in a `<meta>` tag (GitHub Pages
cannot send headers) and in `_headers`.

## Run locally

```sh
python3 -m http.server -d site 8000
```

## Deploy

- GitHub Pages: push to `main`; `.github/workflows/pages.yml` publishes `site/`.
- Cloudflare (optional): `npx wrangler deploy` (config in `wrangler.jsonc`, needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
