# Proposal: Quorum as one product, with one workflow

Status: implemented. The guide starts at [Get started](../docs/README.md).

Where the implementation differs from this proposal:

- **The AI in Studio** only writes the request ("Ask agent", and "Copy the request" in Alternatives) for the person to paste into their agent. Studio never runs an agent CLI and never holds an API key.
- **Studio is dark only**, and the website, the presenter panel and the link preview use the same style.
- **The template repository** is made from `templates/starter` by `scripts/template-repo.js`; it still has to be published as `JBoixCampos/quorum-talk` and marked as a template on GitHub.
- **Inline editing** covers headings and paragraphs with plain text, bold, italics, code and links; everything else opens its Markdown.
- `quorum` alone opens Studio in a talk folder, and `quorum present` is the new name of `quorum live` (both work).

## The problem

Quorum grew feature by feature: a format, a CLI with sixteen commands, a preview, a live server, a panel, an export, a repository workflow, remix, Studio. Each piece works, but nobody can say in one sentence how you are meant to use them together. The website still tells the story from before Studio and PowerPoint existed.

Some pieces also sit in the wrong place:

- **Remix lives in two places and means two things.** Studio's Remix is Quorum rearranging blocks without AI. `quorum variant` is agents writing files. Neither is "ask an AI for a better slide", which is what people expect.
- **Studio is an editor you open next to the real tools.** You still go back to the terminal to present, to export or to see the problems.
- **The start is a list of commands.** `npm install -g github:...`, `quorum new`, then pick one of four commands.

## The workflow

One sentence: **start from the template, let your agent write the talk, shape it in Studio, then present it live or export it.**

```text
  1. Start            2. Write              3. Shape               4. Give
  ----------          ----------            ----------             ----------
  Use the template    Your agent writes     Studio: see every      Present live (QR,
  on GitHub, or       talk.md in the repo   slide, fix by hand,    tunnel, panel) or
  npx quorum new      (Claude Code, Codex,  drag blocks and        export PPTX / PDF
                      Cursor...), locally   polls in, ask the      from Studio
                      or in the cloud       agent for options
```

### 1. Start

The landing page has one main button: **Use this template**. It opens GitHub's "create a repository from a template" for a `quorum-talk` template repository, which holds:

- `talk.md` (a short starter talk),
- `package.json` with Quorum as a dev dependency, so `npm install` then `npm run studio` works without a global install,
- `AGENTS.md` and `CLAUDE.md` (how to write, check and design a talk),
- `.github/workflows/quorum.yml` (checks, a playable build and a PowerPoint file on every push),
- `.gitignore` and `.gitattributes` (slide by slide merging).

For people without GitHub: `npx quorum new my-talk` makes the same folder.

### 2. Write: the agent works in the repository

Quorum does not ship an AI. Your agent, the one you already use, writes the talk:

- **Locally**: Claude Code, Codex or Cursor in the folder. Studio is open at the same time and shows each change as it lands.
- **In the cloud**: Claude Code on the web, or any agent with repository access, works on a branch and pushes. You pull (Studio can show "the branch has new commits, pull?") and see the result.

The agent's tools are the CLI commands that already exist (`check --json`, `snapshot`, `schema`, `diff`), and the instructions in `AGENTS.md`. Nothing new is needed here except clearer instructions.

### 3. Shape: Studio is the home for the person

`npm run studio` (or `npx quorum`, which opens Studio when run in a talk folder) is where the person spends their time. It grows from an editor into the whole app:

| Area | What it does |
| --- | --- |
| **Edit** | The canvas, the slide rail, the inspector (what exists today, redesigned) |
| **Insert** | A library to drag onto a slide or the rail: text blocks, cards, steps, timeline, chart, picture, and the interactive ones (poll, quiz, estimate, word cloud, sentence, questions, join QR, countdown, your own components) |
| **Problems** | Every `quorum check` warning, with the slide; click to go there |
| **Alternatives** | For the selected slide: Quorum's own layouts (instant, offline), and options from your agent (see below) |
| **Rehearse** | The talk full screen with the simulated audience and the presenter view, without a tunnel |
| **Present** | Starts the live session (below) |
| **Export** | PowerPoint or PDF, with the options, a progress bar and the summary (fonts, parts that became pictures) |

### 4. Give: from Studio

**Present** in Studio:

- If the talk has no interactive slides: opens the presentation full screen and the presenter view. No server for the audience, no tunnel.
- If it has: starts the live session (the server, the public link through cloudflared or ngrok if installed, the QR code), and opens the shared window and the panel. Studio shows the status (link, people connected) and a **Stop** button. If no tunnel tool is installed, it says so and offers the local network address.

**Export** writes the file into `export/` and offers to open it. After a live talk it offers "Export with the results".

## Where the AI comes from in Studio

This is the open question from the remix discussion. Studio runs on the person's computer and has no AI of its own. Three ways to give it one, which can be combined:

1. **The agent CLI on this computer (recommended).** If `claude` (Claude Code) or `codex` is installed, Studio's "Ask your agent" runs it headless in the talk folder with a precise task: "write three alternatives for slide `four-ingredients` with these directions, save each with `quorum variant add`". The variants appear in the Alternatives tray as they arrive. No API keys in Quorum: it uses the agent and the account the person already has, with that agent's own permission rules.
2. **Copy the request (always available).** Studio writes the prompt ("Make three alternatives for the slide Four ingredients...") and copies it, for the agent running in another window, in the IDE or in the cloud. Studio picks up the variant files when they arrive (locally, or after a pull).
3. **An API key (later, optional).** Studio calls the Claude API directly with a key the person enters. Simplest to use, but it puts a key and network calls into Quorum, so it is not part of the first step.

"Ask your agent" is not only for alternatives: the same box takes any request about the selected slide or element ("make this a chart", "shorter", "add a poll about this"). The agent edits the files; Studio shows the result, and undo works on it (Studio takes a snapshot of the files before each agent run).

Quorum's own layouts stay, renamed from Remix to part of **Alternatives**: they are free, instant and work offline, and they are the baseline the agent's options sit next to.

## Studio, redesigned

The current Studio is functional but looks like a tool panel. The aim is something that feels like a 2026 design tool: calm, fast, obvious.

**Look**

- Follows the system's light or dark mode, with its own small design system (Inter, a neutral grey scale, one accent, 8 px grid, soft shadows, 10 px radius).
- Icons from the bundled Lucide set on every button, with a tooltip and the shortcut.
- The canvas floats on a dotted background with a zoom control (fit, 50 to 200 %).
- Empty states, loading skeletons for thumbnails, smooth transitions between slides.

**Editing**

- **Text is edited on the slide.** Click into a heading or paragraph and type, like in Keynote. Bold, italics and links with the usual shortcuts. The Markdown editor stays for anything more complex (the Source drawer).
- **A floating toolbar** next to the selection: style, alignment, colour, delete, duplicate, "ask agent".
- **Structured editors** in the inspector for each block, instead of raw Markdown:
  - poll and quiz: the question, the options (add, remove, drag to reorder, mark the right one), the result look;
  - estimate: question, min, max, answer, unit;
  - chart: a small data table (label, value), the chart type, unit;
  - cards, steps, timeline, key figures: the items as a list you can reorder;
  - picture: description, fit, crop position.
- **Drag from the Insert library** onto the slide (into a position in the flow, or anywhere on a canvas slide) or onto the rail (a new slide with that block). An interactive block dropped on a slide that already has one makes a new slide, since one slide asks one thing.
- **A command palette** (Ctrl+K): go to a slide, add a block, change the theme, export, present.
- **The rail** groups slides by section, shows which ones ask the audience, and which have problems.

**What does not change**: every action is still an edit to the talk's files, `git diff` shows it, agents and Studio work on the same files at the same time.

## The command line

The CLI stays, because agents and CI use it. For people, the help is split in two:

```text
For you
  quorum                 Open Studio for the talk in this folder
  quorum new <folder>    Start a talk
  quorum present         Give the talk live (as Present in Studio)

For agents and CI
  quorum check, snapshot, schema, diff, remix, variant, export, build, split, join, repo
```

## The website

Rewritten around the workflow, not around features.

- **Landing page**: one sentence, one short looping video of the four steps, the **Use this template** button, then one section per step with a real screenshot, then "what the audience sees", then "no accounts, no cloud", then the two ways in (template, `npx`).
- **Docs**, reordered:
  1. Get started (template, install, the four steps in ten minutes)
  2. Writing with an agent (local, cloud, what to ask, the checks)
  3. Studio (editing, inserting, alternatives, ask your agent)
  4. Presenting (rehearse, live, the panel, the day itself)
  5. PowerPoint and PDF
  6. Teams and repositories
  7. Reference: the talk format, design and themes, components, the CLI
- A **"how it fits together"** page with one diagram: repository, agent, Studio, audience.

## Plan

| Step | What | Why first |
| --- | --- | --- |
| 1 | Studio design system and shell: light and dark, icons, toolbar, rail, zoom, command palette | Everything else is built inside it |
| 2 | Present, rehearse and export from Studio, the Problems panel | Closes the loop: nobody needs the terminal |
| 3 | Insert library with drag and drop, structured editors for interactive blocks and charts, inline text editing | The editing the user asked for |
| 4 | Alternatives with "Ask your agent" (agent CLI, copy fallback), snapshots for undo | The AI part, built on the files workflow |
| 5 | The template repository, `npx quorum`, the simplified help | The start of the workflow |
| 6 | The website and docs, rewritten; new screenshots and a short video | Explains the finished product |

## Risks

- **Running an agent CLI from a web page** must stay safe: only the local Studio (key, localhost, origin check) can start it, it runs in the talk folder, the prompt is shown before it runs, and it uses the agent's own permission settings. Not available when Studio is reached through a tunnel.
- **Inline text editing** on a rendered slide must map back to Markdown exactly. Plain text with bold, italics and links can; anything else opens the Markdown editor instead of guessing.
- **Presenting from Studio** starts a public tunnel. Studio must make it obvious when the talk is public and stop it cleanly.
- **Scope.** Step 3 is the biggest. Steps 1, 2 and 5 already make the product coherent and can ship first.

## Questions to decide

1. Where does the AI in Studio come from: the agent CLI on this computer with the copy fallback (recommended), copy only, or an API key?
2. The start: a GitHub template repository plus `npx quorum new` (recommended), or `npx` only?
3. Studio's look: follow the system's light or dark mode (recommended), or dark only?
4. Presenting from Studio: open the shared window and the panel as separate windows (recommended, works with a projector), or turn Studio itself into the presenter view?
