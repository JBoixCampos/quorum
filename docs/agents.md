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
an estimate with a reveal, a word cloud and a questions slide.
Run `quorum check --json` until it reports no warnings.
```

Give it your brand too, if you have one: "Use our colours, #0b5fff and #00a078, and the logo in images/logo.svg."

## 4. Look at it and ask for changes

Run `quorum preview my-talk` in a terminal of your own. It opens the talk in your browser with a simulated audience, and the slides update every time the agent saves `talk.md`. Ask for changes in plain words: "make the warm-up shorter", "add a slide where people vote on the next experiment", "write a component that shows the answers as a bar chart".

| The agent | You |
| --- | --- |
| Writes and edits `talk.md` | Look at it with `quorum preview` |
| Writes components in `components/` | Decide what the audience should do |
| Runs `quorum check --json` after every change | Give the talk with `quorum live` |

`quorum live` is yours to run, not the agent's: it opens a public link and the windows you present from.

## Checking a talk

`quorum check` lists anything that looks wrong in `talk.md`, with the slide number: a block it does not know, a missing component, logo or image file, a duplicated id. With `--json` it prints a result a program can read, and exits with a non-zero code when there are warnings:

```bash
quorum check my-talk --json
```

```json
{
  "ok": false,
  "title": "How bread rises",
  "slides": 9,
  "interactions": [
    { "slide": 2, "id": "warmup", "kind": "poll", "title": "Do you bake?" }
  ],
  "warnings": [
    "Slide 5: the component \"oven-timer\" has no file components/oven-timer.js."
  ]
}
```

An agent should run it after every change and fix each warning before it says the talk is done.

## What an agent should not do

- **Never touch `.quorum/`.** It holds the votes, the questions and the presenter key of live sessions.
- **Never show or share the presenter key**, or the presentation and panel links that contain it.
- **Do not invent facts or numbers.** An estimate with a reveal should use a well-known fact, with its source in the reveal text.
- **Keep each slide to one idea and few words.** The audience is reading on a screen and answering on a phone.

## Changing Quorum itself

If you want the agent to change Quorum rather than write a talk, open it in a clone of [the repository](https://github.com/JBoixCampos/quorum). [AGENTS.md](../AGENTS.md) at the root describes the project, its commands and its tests.
