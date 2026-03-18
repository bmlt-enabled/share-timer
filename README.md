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
