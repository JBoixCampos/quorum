# Proposal: Quorum Studio, a canvas, PowerPoint and layout exploration

Status: implemented. The guides are [Studio](../docs/studio.md), [PowerPoint and PDF](../docs/powerpoint.md), [Working in a repository](../docs/repository.md) and [Remixing slides](../docs/remix.md).

Where the implementation differs from this proposal:

- **Interactive slides in PowerPoint** become a placeholder in the slide's design that says PowerPoint cannot run the part and points to Quorum, instead of showing the question with a QR code. `--results` still puts the real votes in. The export also works as a way for an agent to make a PowerPoint deck with no audience at all.
- **Remixing has no scores.** The proposal scored variants (balance, fit, variety). Looking at the numbers showed they told you nothing, so `quorum remix <slide>` shows a numbered picture of the options and you choose; only real problems (does not fit, failed checks) are flagged. `--best` does not exist.
- **Commands:** `quorum remix <slide>` (and `--pick`), `quorum variant`, `quorum explore --themes`, instead of `quorum explore --slide`.
- **Studio** is one person on one computer. It has undo and redo for the session, but no command bar and no "ask an agent" box: agents work on the same files, and the editor shows their changes as they happen. `quorum mcp` was not built.
- **Merging** also covers the front matter, key by key.
- **Free positioning** is `layout: canvas` with `{x= y= w= h=}`; `quorum check` warns about elements outside the slide and overlaps.
- Fixed on the way: the bold section divider was empty, the editorial section number was clipped, and the overflow measure missed content pushed above the top edge.

## Why

Quorum can now make a talk that looks designed, and an agent can write, check and look at it on its own. Four things still keep it from being the place where a team makes its decks:

1. **Teams work in parallel.** Several people, each with their own agents, change the same deck. Today nothing helps them see what changed or merge it cleanly.
2. **No PowerPoint.** Decks get sent, reviewed, reused and archived as `.pptx`. A talk that only exists as a web page does not survive the email after the meeting.
3. **No hands-on editing.** Moving a picture, swapping two cards or reordering slides means editing Markdown. That is right for agents and wrong for the person who just wants to nudge something.
4. **One answer per request.** An agent writes one version of a slide. Design is choosing between options, and agents are good at producing many of them in parallel.

## Principles

- **The Markdown stays the source of truth.** Every edit, from a drag on the canvas to an agent's rewrite, ends up as a change to the talk's files. No second format, no database.
- **Git is the collaboration layer.** Quorum does not run a shared editing service. People and agents work in a repository, on branches, and push. Quorum's job is to make that workflow pleasant: files that merge well, checks that run on every push, and a way to see what a change looks like.
- **Local first.** Everything runs on a laptop or in CI. No accounts and no cloud service.
- **No dependencies.** Zip writing and slide merging are small enough to write ourselves. Playwright stays optional.
- **The audience stays anonymous.** Nothing here touches phones.

## The foundation

Two pieces, built first, used by everything below.

### A. Slides that know where they come from

- **Slide ids.** Every slide gets an id from its title (`how-bread-rises`), made unique if needed. An explicit `{#id}` on the title wins. Ids are how commands, variants, diffs and the canvas name a slide, instead of a number that changes when a slide is added before it.
- **Element source maps.** Every heading, paragraph, list item, image and block in the HTML carries `data-src="12-14"`, the lines and file it came from. The canvas uses this to turn a click on the slide into a place in the text, and `quorum check` can point at a line instead of a slide.

### B. One render engine

`src/cli/visual.js` already opens the talk in a headless browser to measure and photograph slides. It becomes a small service with three outputs:

- a **picture** of a slide (for agents, diffs, variant grids, thumbnails),
- the **measured layout** of a slide: every element's box, font, size and colour (for PowerPoint export and overflow checks),
- the **checks** that exist today.

It keeps one browser and several pages open, so rendering twenty slides takes seconds, not minutes.

## 1. Working together through a repository

A talk is already a folder of plain text. Teams put it in a git repository; each person and each agent works on a branch and pushes; changes come back through pull requests (or plain merges). Quorum adds what makes this work well for decks.

### Files that merge well

One `talk.md` merges fine when two people edit different slides, but adding, removing or reordering slides on two branches conflicts. So a talk can be split into one file per slide:

```text
my-talk/
  talk.md              # front matter and the order of the slides
  slides/
    title.md
    why-bread-rises.md
    yeast-poll.md
    ...
```

```markdown
---
title: How bread rises
theme: paper
slides: slides/
---
```

With `slides: slides/`, Quorum reads the files in the order listed in an optional `order:` key, or alphabetically (`010-title.md`, `020-why.md`, numbered with gaps so a slide can be added between two without renaming). Two agents writing two slides never touch the same file. A single `talk.md` keeps working for everyone who does not need this.

```bash
quorum split my-talk     # turn talk.md into slides/, one file per slide
quorum join my-talk      # and back
```

For teams that keep one `talk.md`, Quorum ships a **merge driver** that merges slide by slide: slides added on both sides are both kept, a slide moved on one side and edited on the other gets both changes, and only the same slide edited on both sides falls back to git's line merge. `quorum new` sets it up with one line in `.gitattributes`.

### Check on every push

`quorum new --repo` adds `.github/workflows/quorum.yml` (easy to adapt to other CI):

- `quorum check --json`, failing the build on warnings,
- `quorum check --visual` and `quorum snapshot` when the runner has Playwright,
- `quorum build`, uploaded as an artifact, so anyone can click through the branch's version of the talk with the simulated audience,
- optionally `quorum export --pptx`, so every merge to `main` leaves a fresh PowerPoint.

### See what a change looks like

```bash
quorum diff main            # the slides that changed since main, before and after
quorum diff main --json     # the same, for agents
```

`quorum diff` reads the talk at another git revision, matches slides by id, and lists what was added, removed, moved and changed. With Playwright it renders each changed slide before and after into one picture (`.quorum-snapshots/diff.png`). In CI, the workflow attaches it to the pull request, so reviewing an agent's work is looking at pictures of the slides it changed, not reading Markdown.

### Conventions for agents

The starter `AGENTS.md` and the skill gain a short section on working in a repository:

- One branch per task, named after it (`agent/yeast-chart`), small commits that say which slides changed.
- Pull before starting, run `quorum check` before pushing, never push to `main` directly unless told to.
- In a split talk, touch only the slide files the task is about; adding a slide means a new file and a line in `order:`.
- After pushing, look at `quorum diff main` and fix anything that looks wrong.

The preview server already reloads when files change on disk, so `git pull` while `quorum preview` runs shows teammates' and agents' work immediately.

## 2. PowerPoint export

```bash
quorum export my-talk --pptx                # editable PowerPoint
quorum export my-talk --pptx --results      # with the votes from the last session, as a report
quorum export my-talk --pdf                 # one page per slide
```

### Native shapes, laid out by the browser

The hard part of a good PowerPoint export is layout: where every line of text goes, how big it is, where it wraps. Quorum already has a layout engine that knows its themes perfectly: the browser. So the export renders each slide with the render engine, reads the measured box of every element, and writes a native PowerPoint shape at that place.

| Quorum | In PowerPoint |
| --- | --- |
| Titles, paragraphs, lists | Text boxes with real runs (bold, italic, links, colour), editable |
| Theme colours and fonts | The slide master's colour scheme and font scheme, so new slides made in PowerPoint stay on brand |
| Backgrounds, gradients | Slide backgrounds and gradient fills |
| Images, videos | Pictures (a video becomes its first frame plus a link) |
| Tables | Native tables |
| Cards, timelines, steps, KPIs, compare | Grouped shapes: rectangles, text boxes and icons as vectors |
| Bars and columns | Native PowerPoint charts with their data, editable in PowerPoint |
| Donut, pictogram, race, bubbles, line | Native charts where PowerPoint has one, a vector drawing otherwise |
| Code | A monospace text box with the highlight colours as runs |
| Speaker notes | Notes pages |
| Transitions | Fade, push and PowerPoint's own Morph for `morph` |
| Steps | Click animations (appear and fade) |
| Anything else | A picture of that element, as a last resort, reported in the export summary |

Without Playwright the export still works: it lays out slides from the layout rules instead of measuring them. It is less exact and says so.

### Interactive slides

A poll cannot vote inside PowerPoint, so each interactive slide becomes one of:

- **Before the talk** (default): the question and its options, with a QR code and link to join, so the deck can still be presented with `quorum live` running beside it.
- **After the talk** (`--results`): the question with the real results as a native chart and the right answer marked. A sentence becomes its final text; questions become a list of the approved ones. This is the report people ask for after a talk.
- **Static** (`--no-audience`): the slides without audience parts, like `quorum export` today.

### Fonts

PowerPoint only shows a font if the computer opening the file has it. The export names the theme's fonts and adds a fallback mapping (Fraunces to Georgia, Space Grotesk to Arial, and so on). `--safe-fonts` uses the fallbacks directly, for files going to people whose machines are unknown. The export summary lists the fonts the file needs.

### Reliability

A `.pptx` is a zip of XML files. Quorum writes both itself (Node's `zlib` does the compression). To keep it reliable:

- A structural check after every export: content types, relationships, unique ids, XML well formed.
- Golden tests: export the example talks and compare the XML.
- In CI, when LibreOffice is available, open every exported file headless and convert it to PDF, failing on any error.
- A manual check list in the docs for PowerPoint on Windows, Mac and the web, and Keynote and Google Slides, before each release.

## 3. A minimal canvas

```bash
quorum studio my-talk
```

opens a local editor, for one person on their own laptop. It is small on purpose:

```text
+--------+---------------------------------------------+-----------+
| slides |                                             |  inspect  |
|  [1]   |                                             |  layout   |
|  [2] * |              the slide, as it is            |  theme    |
|  [3]   |                                             |  classes  |
|  [4]   |                                             |  notes    |
|   +    |                                             |           |
+--------+---------------------------------------------+-----------+
|  / commands                                   source   explore   |
+------------------------------------------------------------------+
```

- **Slide rail.** Drag thumbnails to reorder, drop between them to add, right click to duplicate, delete or explore variants.
- **The slide is the real slide**, rendered by the same code that presents it, not a separate editor view.
- **Click to select, double click to edit text in place.** The selection maps to source lines through the source maps.
- **Drag to rearrange.** Within a slide, elements move in the flow: drag a card before another, move a picture from the left of a split to the right, drag a list item up. Each drop is a small text change that keeps the Markdown clean.
- **Drop files.** An image from the desktop goes to `assets/` and into the slide, with an alt text field.
- **The inspector** shows only what the registry knows: the layouts that suit this slide (as small thumbnails with the real content), theme tokens, classes as chips, the result look for interactive slides, notes. Everything is a choice from a list, never a free CSS box.
- **Source view.** One key splits the screen with the slide's Markdown, edited live.
- **Command bar.** `/` for commands: add slide, change layout, explore, export.

Every change is written straight to the talk's files, so it shows up in `git diff` like any other edit. The canvas and agents can work at the same time on the same folder: when a file changes on disk (an agent, an editor, `git pull`), the canvas reloads that slide. If the person was editing that same slide, the canvas shows both versions and lets them pick, instead of overwriting either. There is no undo history of its own: git is the history, and `quorum studio` can commit with a message when asked.

### Free positioning, kept tidy

Flow layouts are what keeps Quorum slides readable, responsive and easy for agents. Sometimes a person really wants to put something exactly there. For that, a new layout:

```markdown
## Where the gas goes {layout=canvas}

![A loaf cut in half](assets/crumb.jpg){x=0 y=0 w=55% h=100%}

Bubbles grow where the gluten is strongest. {x=60% y=30% w=35%}
```

Positions are percentages of the 16:9 stage, so they scale. Dragging snaps to a 12-column grid and to the edges of other elements. `quorum check` warns about elements outside the stage, overlapping text and slides where nothing lines up. Dragging an element on a flow slide never silently switches it to canvas: the inspector offers it.

## 4. Parallel layout exploration

```bash
quorum explore my-talk --slide yeast-poll
```

shows a grid of alternatives for one slide, rendered for real, scored, and ready to pick. Picking one writes it into the slide. The grid also lives in the canvas: right click a slide, "Explore".

### Where variants come from

**Remix, without an agent.** Quorum itself knows how to restructure content, because the registry knows its layouts and blocks. Given a slide, it proposes the structures that fit:

| Content | Remixes |
| --- | --- |
| A list of 3 to 6 short items | cards, steps, timeline, grid, one item per step |
| Items with numbers | KPIs, a chart, a big number for the largest |
| Two lists, or "before" and "after" | compare, columns |
| A paragraph and an image | split left, split right, full bleed with the text on top |
| One strong sentence | statement, quote |
| A table of numbers | chart, KPIs |

It is free, fast and deterministic, and it gives agents and people a baseline to beat.

**Agents in parallel.** For real alternatives, the skill teaches agents to fan out: start several sub-agents, each with a different direction ("data first", "one image and one sentence", "playful", "minimal"), each writing a variant with `quorum variant add yeast-poll < v.md`. Variants are files in `variants/<slide-id>/` with a line of front matter saying who made them and from which direction. They are plain files, so they can be committed and pushed: an agent can push a branch with five variants, and the person picks one from `quorum explore` on their laptop.

**Whole deck directions.** `quorum explore --theme` renders the first slides of the deck in three or four presets, or in theme files the agent drafted from the brief, so the team picks a direction before polishing slides.

### Scoring, honestly

Every variant gets the checks Quorum already has (overflow measured in the browser, contrast, text density), plus three new ones measured on the picture:

- **Balance:** how the ink spreads over the stage, so a slide crowded in one corner scores lower.
- **Fit with the deck:** the same fonts, colours and spacing as its neighbours.
- **Variety:** different from the slides just before and after.

The grid sorts by score and shows why ("text too small for the room", "same layout as slide 6"). A score is a filter, not taste: anything with a warning sinks, and among the rest the person chooses. An agent working alone can pick the best scoring variant with `quorum variant pick yeast-poll --best` and say it did.

## Plan

Each phase is useful on its own and ships with tests and docs.

| Phase | What | Why this order |
| --- | --- | --- |
| 1 | Foundation: slide ids, element source maps, the render service | Everything else uses it |
| 2 | PowerPoint and PDF export | Independent, and the most asked for by businesses |
| 3 | Repository workflow: split talks, the merge driver, `quorum diff`, the CI workflow, agent conventions | Small, and it makes parallel agents safe before giving them more to do |
| 4 | Explore: remix, `quorum variant`, the grid, scoring | Uses the render service and the repository workflow |
| 5 | The canvas: rail, inline editing, drag, inspector, source view, free positioning | The largest piece of new UI, on top of everything else |

## Risks and trade-offs

- **PowerPoint fidelity.** Some CSS has no PowerPoint equivalent (blurs, blend modes, nested layouts). Those elements become pictures, and the export summary says which ones, so nothing degrades silently. Fonts depend on the machine that opens the file.
- **Two formats for a talk.** A split talk and a single `talk.md` must behave the same everywhere (preview, build, export, check, the canvas). `quorum split` and `quorum join` round-trip exactly, and tests run the example talks in both forms.
- **Merge driver.** Git only uses it once configured, and a bug in it could lose a slide. It falls back to git's own merge whenever it is unsure, and is tested on a set of conflicting histories.
- **Canvas and agents on the same files.** Without a server coordinating edits, the canvas can only notice changes, not prevent them. Showing both versions on a clash keeps work from being lost; git keeps everything else.
- **Free positioning.** It can make slides that look bad on other screens or confuse agents. It stays an explicit layout with its own checks, and the docs steer agents to flow layouts.
- **Scoring.** Automatic design scores can feel authoritative. They are presented as checks and reasons, and the person picks.

## Questions to decide

1. **Split talks.** Add `slides/` with one file per slide (recommended), or keep one `talk.md` and rely on the merge driver only?
2. **CI.** Ship a GitHub Actions workflow in `quorum new --repo` (recommended), or only document the commands?
3. **PowerPoint charts.** Native, editable charts (recommended: needs a small embedded spreadsheet per chart, more code) or vector drawings that look right but cannot be edited as charts?
4. **Free positioning.** Add `layout=canvas` (recommended, with its checks), or keep Quorum flow-only and let the canvas only reorder?
5. **Variants in the repository.** Keep variants as committed files in `variants/` (recommended, so agents can push them), or in the ignored `.quorum/` folder?
