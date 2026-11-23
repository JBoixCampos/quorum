# Giving a talk

## Before the day

1. **Go through it with the preview.** `quorum preview my-talk` shows the talk with 24 simulated people who join, vote and ask questions, so every slide looks the way it will with a room. Click through it once with a clock: votes take longer than you think (count on 30 to 60 seconds each).
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

Clicking the right part of the presentation also moves forward; clicking the left third goes back.

### With one screen

On a call with one monitor, share the presentation window and keep the panel in another window or on a tablet (open the panel link there). The presentation window is opened with settings that keep it painting while other windows cover it, so the call keeps showing it live.

### Questions

People can ask at any time from the button on their phone. New questions wait in the panel until you approve them (or approve all). On the questions slide, click one to highlight it while you answer, and click again to mark it as answered.

## If the public link stops

The terminal says so, and the QR code switches to your laptop's address on the local network: people on the same wifi can still join. For a new public link, press Ctrl+C and run `quorum live my-talk` again. Votes and questions are kept.

If you know there will be no internet, use `quorum live my-talk --no-tunnel` and put everyone on the same network as your laptop.

## After the talk

- The results stay in `my-talk/.quorum/state.json` until you delete them. Export what you need (the panel shows every question), then run `quorum clean my-talk`.
- `quorum clean my-talk --key` also creates a new presenter key next time.
- To share a playable version of the talk afterwards, `quorum build my-talk` makes a static site that anyone can open and click through with a simulated audience. It contains your slides and components, never the votes or questions.

## Privacy

- People join without an account or a name. Each phone gets a random id stored in its browser, used only to count one vote per phone.
- Votes and questions live in your talk folder, on your laptop. Nothing is sent to any other service except through the tunnel you start.
- Questions are limited to 140 characters, and to one every few seconds per phone.
- The presenter key (in `.quorum/key.txt` and in the presentation and panel links) is what controls the talk. Do not show those links on screen or share them.
