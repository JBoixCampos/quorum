# Built for agents

A Quorum talk is a Markdown file and a few small JavaScript files. An AI agent can write it, check it and build new interactions for it, the same way it edits code. You stay the speaker: you look at the result, ask for changes and give the talk.

## 1. Install Quorum

The agent runs the `quorum` command, so it must be installed on the computer where the agent works. You need [Node.js](https://nodejs.org) 18 or newer (`node --version` tells you).

```bash
npm install -g github:JBoixCampos/quorum
quorum --version
```

You can also ask the agent to do it: "Install Quorum with `npm install -g github:JBoixCampos/quorum` and check that `quorum --version` works." It will ask your permission before it runs the command.

If `npm install -g` fails with a permission error, use a Node version manager such as [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) instead of the system Node, or follow [npm's guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

## 2. Teach your agent the format

The agent needs to know how a talk is written. Any one of these is enough.

**Install the skill**, for Claude Code and other agents that support skills. It teaches the agent to write and check a talk and build components for it, in any folder. Start a new agent session afterwards so it loads the skill.

```bash
quorum skill                         # Claude Code: ~/.claude/skills/quorum
quorum skill --to path/to/skills     # another agent's skills folder
```

**Start from a talk folder.** `quorum new my-talk` creates the folder with an `AGENTS.md` that explains the format, the commands and the rules in short. Most coding agents read `AGENTS.md` on their own when you open them in that folder.

**Point it at the docs.** [llms-full.txt](https://jboixcampos.github.io/quorum/llms-full.txt) has the whole format and component reference in one file. [llms.txt](https://jboixcampos.github.io/quorum/llms.txt) is a short index.

## 3. Ask for a talk

Open your agent (Claude Code, or any coding agent that can read files and run commands) in an empty folder or in a talk folder, and ask:

```text
Make me a 20-minute Quorum talk about how bread rises, with a warm-up poll,
an estimate with a reveal, a word cloud and a questions slide. Make it look
warm and handmade. Run `quorum check --json` until it reports no warnings,
then `quorum snapshot` and fix anything that looks wrong.
```

Give it your brand too, if you have one: "Use our colours, #0b5fff and #00a078, and the logo in images/logo.svg." Or a mood: "Make it look like a keynote" (the agent picks a theme such as `midnight` or `bold`).

## 4. Look at it and ask for changes

Run `quorum preview my-talk` in a terminal of your own. It opens the talk in your browser with a simulated audience, and the slides update every time the agent saves `talk.md`. Ask for changes in plain words: "make the warm-up shorter", "add a slide where people vote on the next experiment", "write a component that shows the answers as a bar chart".

| The agent | You |
| --- | --- |
| Writes and edits `talk.md` | Look at it with `quorum preview` |
| Picks a theme, layouts and blocks | Say what it should feel like |
| Writes components in `components/` | Decide what the audience should do |
| Runs `quorum check --json` after every change, and `quorum snapshot` to look | Give the talk with `quorum live` |

`quorum live` is yours to run, not the agent's: it opens a public link and the windows you present from.

## Checking a talk

`quorum check` lists anything that looks wrong in `talk.md`, with the slide number: a block, layout, class or icon it does not know, a missing component, logo or image file, a duplicated id, colours with too little contrast. It also suggests design improvements: too many words, images without a description, too many plain slides in a row. With `--json` it prints a result a program can read, and exits with a non-zero code when there are warnings (suggestions never fail it):

```bash
quorum check my-talk --json
```

```json
{
  "ok": false,
  "title": "How bread rises",
  "slides": 9,
  "theme": "editorial",
  "interactions": [
    { "slide": 2, "id": "warmup", "kind": "poll", "title": "Do you bake?" }
  ],
  "warnings": [
    "Slide 5: the component \"oven-timer\" has no file components/oven-timer.js."
  ],
  "issues": [
    { "kind": "file", "slide": 5, "message": "Slide 5: the component \"oven-timer\" has no file components/oven-timer.js." }
  ],
  "suggestions": [
    { "kind": "variety", "slide": 6, "message": "Slides 6 to 9 are all text on the default layout. Break them up: ..." }
  ]
}
```

`issues` are the warnings with a `kind` (`format`, `file`, `contrast`, `overflow`, `error`) and a slide number. `suggestions` have a kind too: `text`, `variety`, `alt`, `overflow`, `contrast`.

An agent should run it after every change and fix each warning before it says the talk is done, then work through the suggestions.

## The design loop

A talk should look good, not only work. Quorum gives an agent what it needs to get there on its own:

| Command | What the agent learns |
| --- | --- |
| `quorum schema --json` | Every theme, setting, layout, block, class, chart and result look, with the values each takes. Ask the tool instead of guessing |
| `quorum schema --icons` | The icon names for `{icon=}` and `:icon[]` |
| `quorum check --json` | Mistakes, contrast problems and design suggestions |
| `quorum check --visual --json` | Also measures every slide in a browser, with its results shown: a slide that does not fit is a warning |
| `quorum snapshot` | A picture of every slide in `.quorum-snapshots/`, and `contact.png` with the whole talk on one image. An agent that can see images looks at it the way the speaker will |
| `quorum theme from logo.svg` | Colours and a theme from the speaker's logo |
| `quorum diff main --json` | The slides that changed since a branch, tag or commit; `--pictures` saves before and after pictures. See [Working in a repository](repository.md) |
| `quorum studio` | Opens an editor for the person: they adjust slides by hand while you keep editing the same files (their changes and yours show up in both). See [Studio](studio.md) |
| `quorum remix <slide>` | One slide in other layouts on one numbered picture; `--pick <n>` applies one. See [Remixing slides](remix.md) |
| `quorum variant add <slide>` | Saves your own version of a slide in `variants/`, so it shows up next to Quorum's remixes (`--by`, `--direction`) |
| `quorum export --pptx` | An editable PowerPoint file (also `--pdf`). Slides where the audience answers become a placeholder that points to Quorum; `--results` puts the real votes in. See [PowerPoint and PDF](powerpoint.md) |

`--visual`, `snapshot` and `export --pptx` need Playwright: `npm install --no-save playwright && npx playwright install chromium`.

The skill comes with a library of slide patterns (opening, agenda, section break, statement, big number, cards, split with a picture, timeline, chart, quiz, questions, closing) and a guide to choosing a theme. See [Design and themes](design.md) for everything a talk can look like.

## What an agent should not do

- **Never touch `.quorum/`.** It holds the votes, the questions and the presenter key of live sessions.
- **Never show or share the presenter key**, or the presentation and panel links that contain it.
- **Do not invent facts or numbers.** An estimate with a reveal should use a well-known fact, with its source in the reveal text.
- **Keep each slide to one idea and few words.** The audience is reading on a screen and answering on a phone.

## Changing Quorum itself

If you want the agent to change Quorum rather than write a talk, open it in a clone of [the repository](https://github.com/JBoixCampos/quorum). [AGENTS.md](../AGENTS.md) at the root describes the project, its commands and its tests.
