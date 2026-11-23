# Get started

Quorum is a way to make talks with your coding agent. You start from a template, the agent writes the slides in Markdown, you shape them in Studio, then you present them live, with the audience answering on their phones, or export them to PowerPoint. Everything runs from your laptop: no accounts, no cloud service.

## How it fits together

| Step | Who | Where | What happens |
| --- | --- | --- | --- |
| 1. Start | you | GitHub or a terminal | A folder (and a repository) with `talk.md`, instructions for agents and checks |
| 2. Write | your agent | the folder | Claude Code, Codex, Cursor or an agent in the cloud writes `talk.md` and checks it |
| 3. Shape | you | Studio | You edit by hand, drag in polls and charts, try other layouts, ask the agent for more |
| 4. Give | you | Studio | **Present** starts the live talk; **Export** writes PowerPoint or PDF |

The talk is plain text in a git repository. The agent and Studio edit the same files, each sees the other's changes as they are saved, and `git diff` always shows what changed.

## 1. Start

You need [Node.js](https://nodejs.org) 18 or newer.

**On GitHub**: use the [quorum-talk template](https://github.com/JBoixCampos/quorum-talk/generate). It makes a repository of your own; clone it, or give it to an agent in the cloud.

**On your computer**:

```bash
npx github:JBoixCampos/quorum new my-talk    # add --repo to start a git repository too
```

Either way you get the same folder:

| File | What it is |
| --- | --- |
| `talk.md` | The talk. A starter that shows every kind of slide |
| `AGENTS.md`, `CLAUDE.md` | How an agent writes, designs and checks a talk |
| `package.json` | Quorum for this folder: `npm run studio`, `npm run check`, `npm run export` |
| `.github/workflows/quorum.yml` | On every push: the checks, a playable copy, pictures of the slides and a PowerPoint file |
| `components/` | Your own interactive pieces, in JavaScript (optional) |

Then, in the folder:

```bash
npm install          # Quorum itself, for this folder
npm run studio       # opens Studio in your browser
```

## 2. Your agent writes it

Open the folder in your agent and describe the talk:

```text
Make me a 15-minute talk on why bread rises, for curious non-bakers. Start with
a warm-up poll, add a quiz on yeast, a chart of the timings and a questions
slide at the end. Midnight theme. Run `quorum check --json` until it reports
no warnings.
```

The agent reads `AGENTS.md`, writes `talk.md`, runs the checker and fixes what it reports: mistakes, poor contrast, slides that do not fit. With Studio open, you watch the slides appear. An agent in the cloud pushes to a branch; pull it and Studio updates. See [Working with an agent](agents.md).

## 3. You shape it in Studio

![Quorum Studio: the slides on the left, a slide with four cards in the middle, a form to edit the cards on the right](images/studio.png)

- **Type on the slide**: double click a title or a paragraph.
- **Insert**: drag polls, quizzes, guesses, questions, charts, cards and pictures onto a slide or between slides.
- **Edit**: a form for each block (the options of a poll, the numbers of a chart), styles, the layout and notes of the slide.
- **Alternatives**: other layouts for a slide, instantly, and a request for your agent when you want more.
- **Theme**: eight themes, your colours, type and motion.

Every change is written to `talk.md`. See [Studio](studio.md).

## 4. Present or export

**Rehearse** opens the talk with 24 simulated people who vote and ask, so you see each slide as the room will.

**Present** starts the talk: a public link (or your local network), the QR code on your slides, the presentation window to share or project, and your panel with the notes, the clock and the questions. See [Presenting](giving-a-talk.md).

**Export** writes an editable PowerPoint file, or a PDF. Slides where the audience answers become a panel that points to Quorum, or, after the talk, a chart of what the room answered. See [PowerPoint and PDF](powerpoint.md).

## A slide is a few lines

This is the Markdown your agent writes. Click the slide to open the vote, then again to close it and to reveal the answer.

<!-- demo-slide: 4 -->

| Block | What the audience does |
| --- | --- |
| `::: poll` | Pick one option, or the right one in a quiz |
| `::: multi` | Pick several |
| `::: estimate` | Guess a number |
| `::: rounds` | Answer the same question over a list |
| `::: sentence` | Write a sentence one word at a time |
| `::: questions` | Ask and upvote, anonymously |
| `::: component` | Whatever you build |

## The guides

- [Working with an agent](agents.md): what to ask, how the agent checks its work, agents in the cloud.
- [Studio](studio.md): editing, inserting, forms, the canvas layout, presenting and exporting.
- [Alternatives for a slide](remix.md): Quorum's own layouts, and versions from your agent.
- [Presenting](giving-a-talk.md): the day itself, the three views, and what to do if people cannot join.
- [PowerPoint and PDF](powerpoint.md): the export, and making PowerPoint decks with an agent.
- [Teams and repositories](repository.md): one file per slide, slide by slide merging, checks on every push, `quorum diff`.
- Reference: [the talk format](format.md), [design and themes](design.md), [components](components.md).

## Commands

Studio does most of this. The commands are there for agents, CI and people who prefer a terminal.

| Command | Does |
| --- | --- |
| `quorum` | Open Studio, in a talk folder |
| `quorum new <folder>` | Start a talk (`--repo` also starts git) |
| `quorum studio [folder]` | Edit, rehearse, present and export |
| `quorum present [folder]` | Give the talk live: public link, QR code, windows |
| `quorum preview [folder]` | The talk with a simulated audience |
| `quorum check [folder]` | Mistakes and design problems (`--json` for tools, `--visual` to measure in a browser) |
| `quorum snapshot [folder]` | A picture of every slide, and a contact sheet |
| `quorum schema` | Every theme, layout, block, class and icon (`--json`, `--icons`) |
| `quorum export --pptx` | A PowerPoint file (`--pdf`, `--results`, `--no-audience`, `--safe-fonts`) |
| `quorum remix <slide>` | Other layouts for a slide (`--pick <n>` applies one) |
| `quorum variant add <slide>` | Save a version of a slide for the person to choose in Studio |
| `quorum diff [rev]` | Which slides changed since a branch, tag or commit (`--pictures`) |
| `quorum split`, `quorum join` | One file per slide, and back |
| `quorum repo` | Slide by slide merging in this clone, and the CI workflow |
| `quorum theme new <name>`, `quorum theme from <logo>` | Save the look as a theme file, or make one from a logo |
| `quorum build [folder]` | A static, playable copy of the talk |
| `quorum export [folder]` | The slides without the audience parts, as a website |
| `quorum clean [folder]` | Delete the votes and questions of the last session |
| `quorum skill` | Install the agent skill for Claude Code (`--to <folder>` for other agents) |

`quorum help` lists the options.
