# Built for agents

In a Quorum talk the audience takes part as people do: live, in the room, from their phones. The talk itself is plain text and small JavaScript files. That makes it something an AI agent can write, check and extend for you, the same way it edits code.

## Ask your agent

Open your agent (Claude Code, or any coding agent that can read files and run commands) in an empty folder or in a talk folder, and ask:

```text
Make me a 20-minute Quorum talk about how bread rises, with a warm-up poll,
an estimate with a reveal, a word cloud and a questions slide.
Run `quorum check --json` until it reports no warnings.
```

Then rehearse it yourself with `quorum rehearse`, and ask for changes in plain words: "make the warm-up shorter", "add a slide where people vote on the next experiment", "write a component that shows the answers as a bar chart".

## What the agent needs

Any one of these is enough:

- **A talk folder made with `quorum new`.** It contains an `AGENTS.md` that explains the format, the commands and the rules in short. Most agents read it on their own.
- **The documentation in one file**: [llms-full.txt](https://jboixcampos.github.io/quorum/llms-full.txt) has the whole format and component reference. [llms.txt](https://jboixcampos.github.io/quorum/llms.txt) is a short index.
- **The repository**, if the agent is changing Quorum itself: [AGENTS.md](../AGENTS.md) at the root describes the project, its commands and its tests.
- **The skill** in [agents/quorum/SKILL.md](../agents/quorum/SKILL.md), for agents that support skills: it teaches how to create, check and rehearse a talk.

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
