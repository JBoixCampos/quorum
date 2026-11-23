# Proposal: Quorum Studio, a deck people and agents build together

Status: proposal. Nothing here is implemented yet.

## Why

Quorum can now make a talk that looks designed, and an agent can write, check and look at it on its own. Four things still keep it from being the place where a team makes its decks:

1. **One author at a time.** A talk is a file on one laptop. Two people, or one person with two agents, editing it at once overwrite each other.
2. **No PowerPoint.** Decks get sent, reviewed, reused and archived as `.pptx`. A talk that only exists as a web page does not survive the email after the meeting.
3. **No hands-on editing.** Moving a picture, swapping two cards or reordering slides means editing Markdown. That is right for agents and wrong for the person who just wants to nudge something.
4. **One answer per request.** An agent writes one version of a slide. Design is choosing between options, and agents are good at producing many of them in parallel.

This proposal groups the four into one feature, **Quorum Studio**, because they share the same foundation: a deck that can be changed by several hands through one edit model, and rendered by one engine.

## Principles

These are the rules Quorum already follows, and they shape every choice below.

- **The Markdown stays the source of truth.** Every edit, from a drag on the canvas to an agent's rewrite, ends up as a change to `talk.md`. No second format, no database. An agent can always open the file and understand the deck.
- **Local first.** Studio runs on one person's laptop, like `quorum live`, and is shared through the same tunnel. No accounts and no cloud service.
- **No dependencies.** Zip writing, text merging and the agent protocol are small enough to write ourselves. Playwright stays optional.
- **Agents propose, people decide.** An agent's change arrives as a proposal the person it works for can accept, unless they chose to let it write directly.
- **The audience stays anonymous.** Collaborators have names; the audience never does, and nothing in Studio reaches phones.

## The foundation

Three pieces, built first, used by all four features.

### A. Slides that know where they come from

Today the parser knows the first line of each slide. Studio needs more:

- **Stable slide ids.** A slide keeps its id when it moves, when its title changes or when a slide is added before it. The Studio server assigns ids and tracks them across edits by aligning the old and new list of slides (same text, then same title, then same position). Nothing is written into the Markdown. An explicit `{#id}` on the title still wins.
- **Element source maps.** Every heading, paragraph, list item, image and block in the HTML carries `data-src="12-14"`, the lines it came from. The canvas uses this to turn a click on the slide into a place in the text, and `quorum check` can point at a line instead of a slide.

### B. One edit model

Every change, from any client, is one of a few operations on the Markdown:

| Operation | What it does |
| --- | --- |
| `replace-slide` | New text for one slide |
| `insert-slide`, `delete-slide`, `move-slide` | The order of the deck |
| `replace-lines` | New text for a range of lines inside a slide (what the canvas and inline editing send) |
| `set-attr` | Set or remove `{key=value}` or a class on an element, or a front matter key |
| `add-asset` | Store an image in `assets/` and return its path |

Each operation names the revision of the slide it was based on. The server applies it, saves `talk.md`, records it in the history and broadcasts it. If the slide changed in between, the server merges the two edits line by line (a small three-way merge) and only reports a conflict when both touched the same lines.

The history lives in `.quorum/history/` (not committed): every operation with who made it and when. It gives undo, a timeline per slide and a way back to any earlier version of the deck.

Edits made outside Studio are not lost: when `talk.md` changes on disk (a person in their editor, an agent with file access, `git pull`), the server reads it, diffs it against the last version it wrote and records the difference as an operation by "the file".

### C. One render engine

`src/cli/visual.js` already opens the talk in a headless browser to measure and photograph slides. It becomes a small service with three outputs:

- a **picture** of a slide (for agents, variant grids, thumbnails),
- the **measured layout** of a slide: every element's box, font, size and colour, read from the browser (for PowerPoint export and overflow checks),
- the **checks** that exist today.

It keeps one browser and several pages open, so rendering twenty variants takes seconds, not minutes.

## 1. Collaborative deck: people and their agents

### How it looks

```bash
quorum studio my-talk
```

```text
Studio for "How bread rises" at https://bright-otter.trycloudflare.com/studio

  Edit link for others:   .../studio#e=7Hq2...   (anyone with it can edit)
  Your agent's key:       quorum studio key --seat you
```

Each person opens the edit link, types their name and gets a **seat**. A seat is a person plus the agents working for them. On the canvas, everyone sees:

- who is on which slide (a coloured dot on the thumbnail and a cursor on the slide),
- which slides an agent is working on ("Ana's agent is rewriting slide 7"), with a soft lock so two agents do not rewrite the same slide at once,
- proposals waiting on each slide, shown as a badge.

### Agents in a seat

Each seat can connect as many agents as it wants. An agent works through one of two doors:

- **`quorum mcp`**, a Model Context Protocol server over stdin and stdout, so Claude Code, Claude Desktop and other agents can use Studio as a set of tools. No dependency: the protocol is JSON lines.
- **The command line**, for agents that prefer shell commands:

```bash
quorum slides                       # id, title, layout, revision, who is on it
quorum slide get s7                 # the Markdown of one slide
quorum slide propose s7 < new.md    # a proposal, attributed to your seat
quorum slide put s7 < new.md        # a direct edit, if your seat allows it
quorum slide render s7              # a picture, for agents that can see
quorum comments --mine              # tasks people left for your seat
```

The tools an agent gets through MCP are the same: `list_slides`, `get_slide`, `propose_slide`, `put_slide`, `render_slide`, `check`, `schema`, `comments`, `claim_slide`.

Every agent key belongs to one seat, so every change is attributed: "Ana's agent (Claude)" in the history, in proposals and in presence.

### Proposals and comments

- An agent's change to a slide arrives as a **proposal**: the slide as it would look next to the slide as it is, with the text diff underneath. The seat's person accepts, rejects or edits it. Anyone can see it; by default only the seat that owns the agent accepts it, and the deck owner can accept anything.
- A seat can switch its agents to **direct edits** when it trusts them, for example during a first draft.
- **Comments** pin to a slide or an element. A comment that starts with `@agent` (or `@ana-agent`) becomes a task for that seat's agents, which they pick up with `comments`. "@agent make this a chart" on a table is the most natural way to ask for a change on the canvas.

### Roles

| Role | Can |
| --- | --- |
| Owner (the laptop running Studio) | Everything, including components, settings, presenting and closing Studio |
| Editor (edit link) | Edit `talk.md`, upload images, comment, accept proposals for their seat |
| Viewer (view link) | See the deck and comment |

Editors cannot write JavaScript: components run in the browser of whoever presents, so only the owner and agents on the owner's laptop add or change them. The edit key is separate from the presenter key, and neither works for the other.

### Why not a real-time text editor (CRDT)

Character-by-character co-editing (as in Google Docs) needs a CRDT library, which breaks the no-dependency rule, and it is the wrong unit for this tool: agents write whole slides, people move whole elements, and a deck is naturally split into slides. Slide-level operations with a line merge and soft locks cover how teams and agents actually work, with a fraction of the code.

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

Studio's page is the canvas. It is small on purpose:

```text
+--------+---------------------------------------------+-----------+
| slides |                                             |  inspect  |
|  [1]   |                                             |  layout   |
|  [2] * |              the slide, as it is            |  theme    |
|  [3]   |                                             |  classes  |
|  [4]   |                                             |  notes    |
|   +    |                                             |           |
+--------+---------------------------------------------+-----------+
|  / commands     ask an agent about this...        source  history |
+------------------------------------------------------------------+
```

- **Slide rail.** Drag thumbnails to reorder (`move-slide`), drop between them to add, right click to duplicate, delete or explore variants.
- **The slide is the real slide**, rendered by the same code that presents it, not a separate editor view. What you see is what the room sees.
- **Click to select, double click to edit text in place.** The selection maps to source lines through the source maps; the edit is a `replace-lines`.
- **Drag to rearrange.** Within a slide, elements move in the flow: drag a card before another, move a picture from the left of a split to the right, drag a list item up. Each drop is a small text change that keeps the Markdown clean.
- **Drop files.** An image from the desktop goes to `assets/` and into the slide, with an alt text field that `quorum check` will ask about anyway.
- **The inspector** shows only what the registry knows: the layouts that suit this slide (as small thumbnails with the real content), theme tokens, classes as chips, the result look for interactive slides, notes. Everything is a choice from a list, never a free CSS box.
- **Source view.** One key splits the screen with the slide's Markdown, edited live. People who prefer text never have to leave the canvas.
- **Command bar.** `/` for commands (add slide, change layout, export), and a box to ask the seat's agent about the current selection.

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
quorum explore my-talk --slide 7
```

shows a grid of alternatives for one slide, rendered for real, scored, and ready to pick. Picking one is a `replace-slide`. The grid also lives in Studio: right click a slide, "Explore".

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

**Agents in parallel.** For real alternatives, the skill teaches agents to fan out: start several sub-agents, each with a different direction ("data first", "one image and one sentence", "playful", "minimal"), each writing a variant with `quorum variant add s7 < v.md`. Variants are stored in `.quorum/variants/<slide-id>/`, with who made them and from which direction.

**Whole deck directions.** `quorum explore --theme` renders the first slides of the deck in three or four presets, or in theme files the agent drafted from the brief, so the team picks a direction before polishing slides.

### Scoring, honestly

Every variant gets the checks Quorum already has (overflow measured in the browser, contrast, text density), plus three new ones measured on the picture:

- **Balance:** how the ink spreads over the stage, so a slide crowded in one corner scores lower.
- **Fit with the deck:** the same fonts, colours and spacing as its neighbours.
- **Variety:** different from the slides just before and after.

The grid sorts by score and shows why ("text too small for the room", "same layout as slide 6"). A score is a filter, not taste: anything with a warning sinks, and among the rest the person chooses. An agent working alone can pick the best scoring variant and say it did.

## Plan

Each phase is useful on its own and ships with tests and docs.

| Phase | What | Why this order |
| --- | --- | --- |
| 1 | Foundation: slide ids, element source maps, the edit model with history and merge, the render service | Everything else uses it |
| 2 | PowerPoint and PDF export | Independent, and the most asked for by businesses |
| 3 | Explore: remix, `quorum variant`, the grid, scoring | Uses the render service; works for one agent before Studio exists |
| 4 | Studio for one person: the canvas, inspector, source view, proposals from local agents, `quorum mcp` | The editing surface, before adding more people |
| 5 | Studio for teams: edit links, seats, presence, soft locks, comments as agent tasks, roles | The hardest part, on top of everything that already works |

## Risks and trade-offs

- **Scope.** This is bigger than the design system. Phases 1 and 2 are well understood; phase 5 is the one to keep small (slide-level locks, no character-level co-editing).
- **PowerPoint fidelity.** Some CSS has no PowerPoint equivalent (blurs, blend modes, nested layouts). Those elements become pictures, and the export summary says which ones, so nothing degrades silently. Fonts depend on the machine that opens the file.
- **Edit links on a public tunnel.** Anyone with the link can change the deck and upload images. Mitigations: long random keys, an expiry, the owner can revoke a seat, uploads limited to image types and size, paths confined to the talk folder, no JavaScript from editors, and the full history to undo anything.
- **Merges.** Line-level merges can produce a slide that parses but reads oddly. Conflicts are shown, never auto-resolved by picking a side, and every merge is in the history.
- **Free positioning.** It can make slides that look bad on other screens or confuse agents. It stays an explicit layout with its own checks, and the docs steer agents to flow layouts.
- **Scoring.** Automatic design scores can feel authoritative. They are presented as checks and reasons, and the person picks.

## Questions to decide

1. **Hosting.** Studio runs on one laptop and is shared through a tunnel (recommended, consistent with `quorum live`), or Quorum also offers a self-hostable server for teams that want a deck always online?
2. **Agent changes.** Proposals by default with a per-seat switch to direct edits (recommended), or direct edits by default?
3. **PowerPoint charts.** Native, editable charts (recommended: needs a small embedded spreadsheet per chart, more code) or vector drawings that look right but cannot be edited as charts?
4. **Free positioning.** Add `layout: canvas` (recommended, with its checks), or keep Quorum flow-only and let the canvas only reorder?
5. **MCP.** Ship `quorum mcp` (recommended: it is the natural door for Claude and other agents) or only the command line?
6. **First phase to build.** Foundation plus PowerPoint first (recommended), or foundation plus explore, if agent design quality matters more right now than Office?
