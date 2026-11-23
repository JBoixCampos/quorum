# AGENTS.md

Notes for AI agents (and people) working on Quorum itself. To write a talk with Quorum, see `templates/starter/AGENTS.md` and `docs/agents.md` instead.

## What Quorum is

A command line tool and a small web app for presentations where the audience takes part. A talk is a Markdown file (`talk.md`) with `:::` blocks. `quorum live` runs a Node server on the speaker's laptop; phones join through a QR code and answer with plain HTTP long polling. The same session code runs on the server and in the browser, which is how rehearsal mode and static demos work without a server.

## Layout

| Path | What it is |
| --- | --- |
| `bin/quorum.js` | The command line: new, rehearse, live, offline, check, build, clean |
| `src/cli/` | Command helpers: `check.js` (also `--json`), `system.js` (tunnels, browser windows) |
| `src/server/server.js` | The HTTP server: talk, state, long polling, static files |
| `src/shared/` | Runs in Node and in the browser: `markdown.js` (the talk parser), `session.js` (state and actions), `kinds.js` (one entry per interaction kind) |
| `app/` | The web app: `present.html` (the shared screen), `panel.html` (the presenter), `join.html` (phones), with `js/` and `css/` |
| `app/js/components.js` | Component loading and the built-in components (countdown, qr, embed) |
| `examples/demo/` | The demo talk published on the website |
| `examples/components/` | Example components, shown on the website's Examples page |
| `templates/starter/` | What `quorum new` copies, including its own `AGENTS.md` |
| `docs/*.md` | The documentation. The single source of truth for the website's docs pages and `llms.txt` |
| `site/` | The landing page and the website's shared CSS and JS (`assets/`) |
| `scripts/build-site.js` | Builds `_site/`: landing, docs, examples, playground, demo, llms.txt, llms-full.txt, then checks every internal link |
| `agents/quorum/SKILL.md` | A skill that teaches an agent to create, check and rehearse a talk |
| `test/` | Unit tests (`*.test.js`) and end-to-end tests (`e2e/`) |

## Commands

```bash
npm test               # unit tests (node --test), no dependencies
npm run test:e2e       # server, presentation, panel and phones, then the website (needs Playwright)
npm run demo           # rehearse examples/demo in the browser
npm run build:site     # the website in _site/; fails on a broken internal link
python3 -m http.server -d _site   # look at the built site locally
node bin/quorum.js check templates/starter --json
```

Playwright is not a dependency. If it is missing: `npm install --no-save playwright && npx playwright install chromium`.

## Conventions

- **No runtime dependencies**, and no build dependencies either. Node 18 or newer. Plain ES modules, no bundler, no framework.
- **Keep the component API backwards compatible**: `mount(el, ctx)` returns `{ update, primary, destroy }`, all optional. `ctx` has `params`, `text`, `state`, `setState`, `answers`, `step`, `view`, `act`, `talk`, `chatMode`, `where`, `rehearse`, `publicUrl`.
- **Code in `src/shared/` must run in both Node and the browser**: no Node imports there.
- **Docs live in `docs/*.md`** and must read well on GitHub. The website renders them at build time with `scripts/site/markdown.js`, which supports a subset of Markdown: headings, paragraphs, lists, tables, fenced code, inline code, links, bold and emphasis. Link between docs with relative `.md` links; the build rewrites them. A new doc must be added to `DOCS` in `scripts/build-site.js`.
- **Website paths are relative**, so the site works under `/quorum/` on GitHub Pages and from a local folder. No analytics, trackers or requests to other hosts: fonts are bundled in `app/fonts/`.
- **Copy is in English, plain and specific.** No em dashes anywhere (code, comments, docs, commits): use commas, colons, parentheses or separate sentences. No ALL-CAPS labels, no arrows appended to buttons.
- **The audience is anonymous.** Never add personal data, accounts or tracking.
- Any Python follows PEP 8.

## Tests

- Add a unit test in `test/` for new parser, session or command behaviour.
- `test/e2e/run.js` uses the starter talk and relies on its slide indexes (poll on slide index 2, the counter on 10, questions on 11). If you change `templates/starter/talk.md`, update those indexes.
- `test/e2e/site.js` builds the website into a temporary folder, serves it under `/quorum/` and checks the playground, `?slide=N`, the docs and that no page makes an external request.

## Constraints

- Never commit `.quorum/` folders: they hold votes, questions and presenter keys.
- The presenter key controls a live talk. Never log it in a way that ends up on screen, and never put it in a URL that phones see.
- The Pages workflow (`.github/workflows/pages.yml`) runs `npm test` and `npm run build:site` on every push to `main` and deploys `_site/`.
