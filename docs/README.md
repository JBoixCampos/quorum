# Quorum documentation

Quorum turns a Markdown file into a presentation where the audience takes part. People scan a QR code and answer from their phones; the results land on your slides. Everything runs from your laptop.

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install -g github:JBoixCampos/quorum

quorum new my-talk          # a starter talk that shows every feature
quorum preview my-talk      # see it with a simulated audience
quorum live my-talk         # give it
```

`quorum new` creates a folder with `talk.md`, a `components/` folder and an `AGENTS.md` for AI agents. Edit `talk.md` while `quorum preview` is running and the slides update on their own.

## A slide is a few lines

This Markdown makes the slide next to it. Click the slide to open the vote, then again to close it and to reveal the answer.

<!-- demo-slide: 4 -->

Every block works the same way: you write it in `talk.md`, phones get the right input, and the screen shows the results.

| Block | What the audience does |
| --- | --- |
| `::: poll` | Pick one option |
| `::: multi` | Pick several |
| `::: estimate` | Guess a number |
| `::: rounds` | Answer the same question over a list |
| `::: sentence` | Write a sentence one word at a time |
| `::: questions` | Ask and upvote, anonymously |
| `::: component` | Whatever you build |

## The guides

- [The talk format](format.md): every block, with examples.
- [Components](components.md): build your own slide pieces in JavaScript, including one that uses a local language model.
- [Giving a talk](giving-a-talk.md): the day itself, on stage or on a call.
- [Built for agents](agents.md): ask an AI agent to write, check and extend your talk.

## Commands

| Command | Does |
| --- | --- |
| `quorum new <folder>` | Create a new talk |
| `quorum preview [folder]` | See the talk with a simulated audience, updated as you edit |
| `quorum live [folder]` | Give the talk: server, public link, QR code, windows |
| `quorum check [folder]` | Check `talk.md` for mistakes (`--json` for tools) |
| `quorum build [folder]` | Build a static, playable copy with a simulated audience |
| `quorum export [folder]` | The slides without the audience parts, for when nobody can join |
| `quorum clean [folder]` | Delete the votes and questions of the last session |
| `quorum skill` | Install the agent skill for Claude Code (`--to <folder>` for other agents) |

Options: `--port <n>`, `--file <name>`, `--no-tunnel`, `--no-open`, `--no-moderation`, `--out <folder>`, `--json`, `--to <folder>`.
