# Giving a talk

## Before the day

1. **Rehearse with the simulated audience.** `quorum rehearse my-talk` fills the room with simulated people who join, vote and ask questions. Go through the whole talk at least once with a clock: votes take longer than you think (count on 30 to 60 seconds each).
2. **Run `quorum check my-talk`.** It lists anything that looks wrong in `talk.md`.
3. **Install cloudflared** for the public link: `winget install --id Cloudflare.cloudflared` on Windows, `brew install cloudflared` on a Mac, or see [Cloudflare's downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). ngrok works too. Without either, only people on the same network as your laptop can join.
4. **Do a test run with a real phone**, on mobile data rather than your wifi: `quorum live my-talk`, scan the QR code, vote once, then `quorum clean my-talk`.
5. If you will be **on a video call**, try sharing the presentation window with the tool you will use.

## On the day

```bash
quorum live my-talk
```

This prints three things:

- **Presentation**: opens in its own window. Share or project this window, and only this one.
- **Panel**: opens in your browser. This is for you: preview, notes, next slides, time, people and questions.
- **Audience link**: what the QR code points to.

Drive the talk from either window. In the panel, click the preview or use the arrow keys; in the presentation, use the keyboard or a clicker.

| Key | Does |
| --- | --- |
| → Space Page Down Enter | Next: open voting, close it, reveal, then the next slide |
| ← Page Up Backspace | Previous |
| Home / End | First / last slide |
| N | Speaker notes on the presentation (only if you are not sharing it) |
| F | Full screen |
| B | Chat mode on and off |

Clicking the right part of the presentation also moves forward; clicking the left third goes back.

### With one screen

On a call with one monitor, share the presentation window and keep the panel in another window or on a tablet (open the panel link there). The presentation window is opened with settings that keep it painting while other windows cover it, so the call keeps showing it live.

### Questions

People can ask at any time from the button on their phone. New questions wait in the panel until you approve them (or approve all). On the questions slide, click one to highlight it while you answer, and click again to mark it as answered.

## Plan B: chat mode

If the public link fails, or the audience cannot scan anything (a webinar, people on their phones already), press **B** or "Switch to chat mode" in the panel:

- Phones are told to use the chat of the call.
- Open voting as usual, read the answers in the chat, and click the options on the presentation to add each vote. Numbers and words are typed into a box.
- "Undo" removes the last vote you added.

If you already know there will be no link, start with `quorum offline my-talk`.

If the tunnel stops in the middle of a talk, the terminal says so. Press B and carry on.

## After the talk

- The results stay in `my-talk/.quorum/state.json` until you delete them. Export what you need (the panel shows every question), then run `quorum clean my-talk`.
- `quorum clean my-talk --key` also creates a new presenter key next time.
- To share a playable version of the talk afterwards, `quorum build my-talk` makes a static site that anyone can open and click through with a simulated audience. It contains your slides and components, never the votes or questions.

## Privacy

- People join without an account or a name. Each phone gets a random id stored in its browser, used only to count one vote per phone.
- Votes and questions live in your talk folder, on your laptop. Nothing is sent to any other service except through the tunnel you start.
- Questions are limited to 140 characters, and to one every few seconds per phone.
- The presenter key (in `.quorum/key.txt` and in the presentation and panel links) is what controls the talk. Do not show those links on screen or share them.
