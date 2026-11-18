# BingeRetro

A retro cable-style channel player with a TV guide. Lineups are built in the Setup panel and saved in your browser. Playback uses archive.org and YouTube. No API keys are needed.

## Controls

- Up / Down (or on-screen buttons): change channel
- Number keys: type a channel number, then wait about 1.5 seconds
- G or Guide: program guide. Up/Down picks a channel, Left/Right moves 30 minutes, Enter tunes, G or Esc closes
- S or Setup: setup panel
- Enter: show the info banner
- M: mute

## Setup

- Add a channel with a number, a name, and one or more items.
- archive.org items take an identifier, the part of the URL after `/details/`. The duration is optional, and the app uses the archive's length if you leave it blank.
- YouTube items take a video ID, the part after `v=` in the URL. A duration in seconds is required.
- Link items ("Link (opens on site)") open a page on another site, such as a streaming service. They can't play inside the app. The app shows a card with the link and moves on when the scheduled time runs out, so set the duration to match the show.
- Export copies your lineup to the text box. Import replaces your lineup with the text in the box. `channels.json` is an example you can import.
- Theme changes the guide colours.

## Accuracy of the guide

The guide and the player both use the durations you enter. If a video is shorter than its duration, the next item starts early on screen, and the guide keeps the original times until the schedule resyncs.

Items that fail to load are skipped and logged to the browser console.

## Licensing

Only use archive.org items that are public domain or openly licensed, and show each item's licence. YouTube videos play through the official embedded player. Follow the YouTube terms for anything you distribute.

## Known limits

- Playback with sound needs one Enter or click to start, because browsers block autoplay with sound.
- Some YouTube videos block embedding and will be skipped.
- Lineups are per browser. Export a backup to move them to another device.
