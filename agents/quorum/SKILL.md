---
name: quorum
description: Write, design and check Quorum talks, and build components for them. Quorum talks are presentations written in Markdown where the audience answers from their phones (polls, estimates, rounds, a shared sentence, questions and custom JavaScript components), with themes, layouts, visual blocks, charts and motion. Use when asked to make, edit, restyle or extend a Quorum talk, or a talk with live audience interaction.
---

# Quorum talks

Quorum turns `talk.md` into a presentation where people vote, guess and ask from their phones, and the results appear on the slides. Your job is to author: write the talk, build any components it needs, and check it. The speaker looks at it and gives it.

## 1. Set up

- Check that the command exists: `quorum --version`. If not: `npm install -g github:JBoixCampos/quorum` (Node 18 or newer).
- New talk: `quorum new <folder>`. It creates `talk.md`, `components/counter.js` and an `AGENTS.md` with the format in short. Read that `AGENTS.md`.
- The full reference, in one file: https://jboixcampos.github.io/quorum/llms-full.txt

## 2. Write

Plan first: how long the talk is (`duration:` in the front matter, in minutes), its sections, and where the audience takes part. Count 30 to 60 seconds for each vote.

- One idea per slide, few words. Titles short.
- If the user gives a brand (colours, logo, fonts), put it in the front matter: `accent`, `primary`, `secondary`, `background`, `text`, `palette`, `logo`, `font`, `text-font`, `footer`, `style`. With only a logo, `quorum theme from <logo>` proposes the colours.
- Start with a title slide that has `::: join`, then a quick warm-up `::: poll` so everyone has answered once.
- One interaction per slide, each with a unique `{#id}`.
- An `::: estimate` with a reveal must use a well-known, verifiable fact, with its source in the reveal text. Never invent numbers.
- Put what the speaker should say and press in `::: notes`.
- End with `::: questions` and a closing slide.
- For anything the blocks do not cover, write a component in `components/<name>.js` (see the `AGENTS.md` in the talk folder). Use `audience:` to give phones an input.

## 3. Design

A talk that is only titles and bullets is hard to watch. Make it look designed:

- **Pick a theme** that fits the mood: `theme: midnight` or `bold` (keynote), `editorial` (lecture), `studio` or `paper` (workshop, classroom), `signal` (company), `terminal` (technical). With a brand, keep the theme and set `accent` (and `logo`).
- **Build from patterns.** [patterns.md](patterns.md) has proven slides: opening, agenda, section break, statement, big number, cards, split with a picture, timeline, steps, kpis, chart, compare, quote, quiz, questions, closing. Never more than three slides in a row with the same pattern.
- **Use layouts** (`<!-- layout: split -->`, `section`, `statement`, `big-number`, `quote`, `full`, `grid`, `agenda`, `closing`) and **blocks** (`::: cards`, `timeline`, `steps`, `kpis`, `compare`, `chart`) instead of long lists. Icons: `{icon=name}` on headings, `:icon[name]` in text.
- **Give results a look**: `{chart=donut}`, `pictogram`, `bubbles` or `race` on polls, `{chart=beeswarm}` on estimates, `{chart=wall}` on questions, `reveal=spotlight` for quizzes.
- **Add motion with care**: `transition: morph` and the same `{#title}` on related titles; `{.steps}` on blocks so items appear one by one.
- `reactions: 👏 🤯 ❤️` lets people react at any time; `phone-welcome:` greets them.
- Do not guess names: `quorum schema --json` lists every theme, setting, layout, block, class and look, and `quorum schema --icons` the icons.

## 4. Check

```bash
quorum check <folder> --json
```

It prints `{ ok, title, slides, theme, interactions, warnings, issues, suggestions }` and exits non-zero while there are warnings. Fix each warning and run it again until `ok` is `true`. Then work through the `suggestions` (too many words, plain slides in a row, images without a description).

If Playwright is installed (`npm install --no-save playwright && npx playwright install chromium`):

- `quorum check <folder> --visual --json` also measures every slide in a browser: a slide that does not fit is a warning.
- `quorum snapshot <folder>` saves a picture of every slide (and its results) in `.quorum-snapshots/`, plus `contact.png` with all of them. If you can read images, look at the contact sheet and fix what looks wrong: crowded slides, weak contrast, too many similar slides.

Report the slide count, the theme and the interactions to the user.

## 5. Hand over

Tell the user they can see the talk with `quorum preview <folder>`: it opens in the browser with a simulated audience, and the slides update as you keep editing `talk.md`. Then take their changes and check again.

`quorum live <folder>` gives the talk to a real audience. That is the user's to run, not yours.

### Studio

The user shapes the talk in Quorum Studio (`npm run studio` in the folder, or `quorum studio <folder>`): they type on slides, drag in polls and charts, try layouts, rehearse, present and export from there. It edits the same files you do and shows your changes as soon as they are saved, so keep the talk valid at every save. When they want something from you, Studio saves a request in `requests/` and they tell you to work through them: `quorum requests` lists them, `quorum requests show <id>` gives the slide and what they want, `quorum requests claim <id> --by <you>` takes one (only one agent can), and `quorum requests done <id> --note "what you did"` closes it after you ran `quorum check`. `quorum requests --watch` waits for new ones if you can run a background command. With several agents: `quorum context <slide>` is what a fresh agent reads first, `quorum slide set <slide> --base <hash>` refuses a write if the slide changed since you read it, and `quorum decide "what and why"` records choices for the next agent. See docs/agents.md. Presenting and exporting are theirs. `<!-- layout: canvas -->` with `{x= y= w= h=}` on each element (shares of the slide, 0 to 100) places things freely; use flowing layouts unless the user asks for exact placement. See docs/studio.md.

### Offering alternatives for a slide

When the user is unsure about a slide, or asks for options, do not rewrite it once: give them several. Run `quorum remix <slide>` to see Quorum's own layouts (cards, steps, a timeline, a chart, a split with a picture...) and tell them to look at `.quorum-snapshots/explore/<slide>/options.png`. For real alternatives, write two to five variants, each with a different direction ("data first", "one image and one sentence", "playful", "minimal"): save each with `quorum variant add <slide> --by <you> --direction "<what it tries>" < variant.md`. If you can start sub-agents, give each one a direction and let them write in parallel. A variant is one slide (no `---` line). Never pick for the user unless they ask: they choose with `quorum remix <slide> --pick <n>`. Give the slide an explicit id first (`<!-- id: name -->`) if its title may change. See docs/remix.md.

### Working in a repository

When the talk is in a git repository (other people or agents work on it too): work on a branch named after the task (`agent/yeast-chart`), pull first, make small commits, run `quorum check` before pushing, and never push to `main` unless told to. If the talk is split (`slides:` in the front matter, one file per slide in `slides/`), touch only the slide files for your task: a new slide is a new file, numbered with a gap (`025-new-idea.md`). After pushing, run `quorum diff main --pictures` and look at `.quorum-snapshots/diff/diff.png`. See docs/repository.md.

### A PowerPoint file

When the user wants a `.pptx` (a deck to send, or a report), write the talk the same way, check it, look at `quorum snapshot`, then run `quorum export <folder> --pptx` (add `--safe-fonts` for a file going to unknown computers, `--no-audience` to leave out the slides where the audience answers). The text, shapes, tables and charts are native and editable. Slides with a poll become a panel that says PowerPoint cannot run it and points to Quorum. After a real talk, `--results` puts the votes in the file. Read the summary the command prints (fonts, parts that became pictures) and tell the user about it. See docs/powerpoint.md.

## Never

- Never read, edit or delete `.quorum/` (votes, questions, the presenter key).
- Never show or share the presenter key, or the presentation and panel links that contain it.
- Never add tracking, accounts or requests to other services to a talk without the user asking.
