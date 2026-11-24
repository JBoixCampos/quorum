# Ask your agent

Quorum has no AI of its own. It works with the coding agent you already use: Claude Code, Codex, Cursor, or an agent in the cloud. There is nothing to set up: every talk folder comes with an `AGENTS.md` that explains Quorum to the agent, and most agents read it on their own.

## Ask for a talk

Open your agent in the talk folder and describe the talk: the subject, who it is for, how long, where people should take part, and how it should feel.

```text
Make me a 20-minute talk about how bread rises, with a warm-up poll,
a guess-the-number with a reveal, a word cloud and a questions slide.
Make it look warm and handmade.
```

A few things worth adding:

- **Your brand**: "Use our colours, #0b5fff and #00a078, and the logo in images/logo.svg."
- **A mood**: "Make it look like a keynote." The agent picks a matching theme.
- **Your material**: "Base it on notes.md" or "on the article at this link."

The agent writes the slides, checks them and fixes what it finds. Keep Studio open (`npm run studio`) while it works and you watch the slides appear.

## Ask for changes

In Studio, select a slide or anything on it and press **Ask agent**, then say what you want ("make this a chart", "shorter", "turn it into a quiz"). For whole new versions of a slide, use the **Alternatives** tab instead.

Studio saves the request and copies a short line for you. Paste it into your agent once:

```text
Work through the open Quorum requests: run `quorum requests`, claim each one, and follow AGENTS.md.
```

The agent picks up every open request, changes the slides and leaves a note in Studio's **Team** tab. Alternatives appear in the Alternatives tab for you to choose from. See [Work as a team](teamwork.md) for how requests work, including with several agents, and [Alternatives for a slide](remix.md).

## Agents in the cloud

An agent working on a copy of your repository (Claude Code on the web, a GitHub agent) cannot see your computer. Press **Send** in Studio's Team tab so it gets your requests, and **Pull** when it is done. Each push also runs the checks on GitHub and attaches a playable copy, pictures of the slides and a PowerPoint file. See [Git and repositories](repository.md).

## Agents outside a talk folder

For an agent that works in another folder, install the skill, or point it at [llms-full.txt](https://jboixcampos.github.io/quorum/llms-full.txt), the whole format in one file:

```bash
npx github:JBoixCampos/quorum skill                     # for Claude Code, in any folder
npx github:JBoixCampos/quorum skill --to path/to/skills # another agent's skills folder
```

## Who does what

| The agent | You |
| --- | --- |
| Writes and edits `talk.md`, and components in `components/` | Say what the talk is for and how it should feel |
| Picks a theme, layouts and blocks | Shape it in Studio: wording, order, pictures, polls |
| Runs `quorum check --json` after every change, and `quorum snapshot` to look | Rehearse in Studio |
| Takes requests from the queue, and closes them with a note | Asks from Studio, and reads the notes |
| Writes alternatives as variants when asked | Choose between them |
| Never presents | Present and export from Studio |

Presenting is yours, not the agent's: it opens a public link and the windows you present from.

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
| `quorum theme guide <name> --from <file>` | Keeps written brand guidelines in `themes/` and prints the brief for a theme file and a design guide (`themes/<name>.md`) |
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
