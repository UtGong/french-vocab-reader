# French Vocabulary Reader

A focused French pronunciation practice app. Paste a French paragraph, listen to it one word at a time, and control when the reader advances.

## Features

- French (`fr-FR`) text-to-speech pronunciation
- Two advancement modes:
  - **Voice:** say “OK” to move to the next word
  - **Button:** press **Next word** manually
- Two playback modes:
  - **Once:** pronounce the current word one time
  - **Repeat:** pronounce it again every three seconds
- Pause, reset, word count, and progress tracking
- Responsive interface for desktop and mobile
- Graceful fallback to manual controls when speech recognition is unavailable

## Browser support

The app uses the browser-native Web Speech APIs:

- `SpeechSynthesis` for French pronunciation
- `SpeechRecognition` or `webkitSpeechRecognition` for the optional voice control

Chrome and other Chromium-based browsers provide the best voice-recognition support. Microphone permission is required only in **Voice** mode. Available French voices depend on the operating system and browser.

## Local development

### Requirements

- Node.js 22.13 or newer
- npm

### Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
```

## How it works

1. The paragraph is split into French word tokens while preserving accented characters and apostrophes.
2. The current word is passed to the browser speech synthesizer with `fr-FR` pronunciation.
3. In Voice mode, the microphone listener advances only after recognizing “OK” (browsers may transcribe this as “okay”).
4. In Button mode, no microphone listener is started.

## Privacy

The app has no database and does not save the entered text. Speech synthesis happens through the browser. Voice recognition behavior and processing depend on the browser implementation.

## Technology

- Next.js-compatible App Router components
- React 19
- TypeScript
- vinext/Vite build for Cloudflare-compatible deployment

## License

No license has been specified.
