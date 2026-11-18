# BingeRetro

A retro cable-style channel player. Channels are defined in `channels.json`. Each channel loops its items, and the position in the loop is calculated from the clock, so everyone tuning in sees the same moment. The program guide reads the same schedule.

No API keys are needed.

## Run locally

Browsers block `channels.json` when the page is opened from a file, so serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Controls

- Arrow Up / Down (or on-screen buttons): change channel
- Number keys: type a channel number, then wait about 1.5 seconds
- G: program guide (Esc or Enter closes it)
- Enter: show the info banner
- M: mute

## Adding items

Each channel has a `number`, a `name`, and a list of `items`.

YouTube item:

```json
{ "source": "youtube", "videoId": "VIDEO_ID", "title": "Name", "durationSeconds": 240 }
```

`durationSeconds` is required. Enter the video's length in seconds.

archive.org item:

```json
{ "source": "archive", "identifier": "ITEM_ID", "title": "Name", "durationSeconds": 1320 }
```

`file` (exact filename) is optional. If it's omitted, the app picks an MP4 from the item. `durationSeconds` is optional. If it's omitted, the length comes from archive.org.

Any item can include a `licence` URL, which appears in the info banner.

## Accuracy of the guide

The guide and the player both use the durations you enter. If a video is shorter than its `durationSeconds`, the next item starts early on screen, and the guide keeps the original times until the schedule resyncs. Fix the number to match the real length.

Items that fail to load (missing ID, removed video, embedding blocked) are skipped and logged to the browser console. The guide lists them as unavailable.

## Licensing

Only use archive.org items that are public domain or openly licensed, and show each item's licence. YouTube videos play through the official embedded player. Follow the YouTube terms for anything you distribute.

## Known limits

- Playback with sound needs one Enter or click to start, because browsers block autoplay with sound.
- Some YouTube videos block embedding and will be skipped.
- The app hasn't been tested in a browser yet. Check the archive.org lookups first, since they depend on archive.org allowing browser requests to its metadata endpoint.
