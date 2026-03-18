# Share Timer

A mobile-friendly share timer for 12-step meetings. Keeps shares fair and on time with audio alerts, a speaker queue, and a share time calculator.

## Features

- **Countdown timer** with an animated SVG ring that changes color as time runs low
- **Configurable thresholds** — set share duration, warning time, and alarm time via the settings modal
- **Speaker queue** — add names, work through the list, and auto-start the timer for each person
- **Share time calculator** — input total meeting minutes and number of people to get the per-person time rounded to the nearest 15-second interval, with an Apply button to load it directly into the timer

## Audio

Alerts are generated entirely in the browser using the **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)** — no audio files required. A single persistent `AudioContext` is created and reused for all beeps, avoiding the overhead of spinning up a new context on every alert.

On **iOS**, the Web Audio API is blocked until a user gesture occurs. The timer handles this by calling `audioContext.resume()` the moment the user taps Start. On **iOS 17+**, the app also sets `navigator.audioSession.type = "playback"` so that alert sounds fire even when the device is on silent.

## Preset URLs

Settings can be encoded as URL parameters, making it easy to bookmark or share a pre-configured timer for a specific meeting format.

```
https://timer.bmlt.app/?mins=3&warn=60&danger=10&tone=bell
```

| Parameter | Description | Example |
|-----------|-------------|---------|
| `mins` | Share duration in minutes | `3` |
| `warn` | Warning alert threshold in seconds | `60` |
| `danger` | Alarm threshold in seconds (`0` to disable) | `10` |
| `tone` | Alert tone | `soft`, `bell`, `buzz`, `wacky`, `arcade`, `scifi`, `alarm`, `laser` |

URL params take priority over saved localStorage values. After saving settings the URL is automatically updated via `history.replaceState` so the address bar always reflects the current configuration. The **Copy Link** button in the settings modal builds a shareable URL from the current settings without requiring a save first.

## Screen Wake Lock

The app uses the **[Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)** to prevent the device screen from dimming or locking while the timer is running. Without this, a phone left on a table would lock mid-session and miss the audio alerts.

The wake lock is acquired when the timer starts and released when it is paused, reset, or expires. Because the browser automatically drops the wake lock whenever the page is hidden (e.g. the user switches apps), the app re-requests it as soon as the page becomes visible again while the timer is still running. On browsers that do not support the API the feature is silently skipped.

## Stack

- [Svelte 5](https://svelte.dev) + TypeScript
- [Vite](https://vitejs.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Flowbite Svelte](https://flowbite-svelte.com)

## Development

```bash
npm install
npm run dev
```

```bash
npm run build   # production build
npm run lint    # prettier + eslint + svelte-check
```

[Bootstrapped with svelte5-vite-ts-tailwind-eslint](https://github.com/pjaudiomv/svelte5-vite-ts-tailwind-eslint/)
