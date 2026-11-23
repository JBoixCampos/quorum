# Built for agents

A Quorum talk is a Markdown file and a few small JavaScript files. An AI agent can write it, check it and build new interactions for it, the same way it edits code. You stay the speaker: you look at the result, ask for changes and give the talk.

## Ask your agent

Open your agent (Claude Code, or any coding agent that can read files and run commands) in an empty folder or in a talk folder, and ask:

```text
Make me a 20-minute Quorum talk about how bread rises, with a warm-up poll,
an estimate with a reveal, a word cloud and a questions slide.
Run `quorum check --json` until it reports no warnings.
```

Then open it with `quorum preview` and ask for changes in plain words: "make the warm-up shorter", "add a slide where people vote on the next experiment", "write a component that shows the answers as a bar chart". The preview updates as the agent edits `talk.md`.

## What the agent does, and what you do

| The agent | You |
| --- | --- |
| Writes and edits `talk.md` | Look at it with `quorum preview` |
| Writes components in `components/` | Decide what the audience should do |
| Runs `quorum check --json` after every change | Give the talk with `quorum live` |

## What the agent needs

Any one of these is enough:

- **A talk folder made with `quorum new`.** It contains an `AGENTS.md` that explains the format, the commands and the rules in short. Most agents read it on their own.
- **The documentation in one file**: [llms-full.txt](https://jboixcampos.github.io/quorum/llms-full.txt) has the whole format and component reference. [llms.txt](https://jboixcampos.github.io/quorum/llms.txt) is a short index.
- **The skill** in [agents/quorum/SKILL.md](../agents/quorum/SKILL.md), for agents that support skills: it teaches how to write and check a talk and build components for it.
- **The repository**, if the agent is changing Quorum itself: [AGENTS.md](../AGENTS.md) at the root describes the project, its commands and its tests.

## Checking a talk

`quorum check` lists anything that looks wrong in `talk.md`, with the slide number. With `--json` it prints a result a program can read, and exits with a non-zero code when there are warnings:

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
