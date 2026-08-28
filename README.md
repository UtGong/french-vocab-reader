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
- Persistent learned-word library backed by Neon Postgres
- Chinese part-of-speech and meaning fields for every saved word
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

1. The paragraph is split into French word tokens while preserving accented characters and apostrophes, then AI-generated IPA, parts of speech, and Chinese meanings are shown for confirmation.
2. Study and review use a click-to-advance player. Review mode never changes the first-learned date.
3. Pronunciation uses only an installed French system voice (`fr-FR` preferred); the app never silently falls back to an English voice.
4. CEFR recommendations are checked against FLELex/Beacco, and learned words can be reused in AI-generated sentence exercises.

## Privacy

The entered paragraph is not saved. Account passwords are stored as salted hashes, sessions use HttpOnly cookies, and vocabulary data is isolated by user account. Speech synthesis happens through the browser and depends on an installed French system voice.

## Technology

- Next.js App Router
- React 19
- TypeScript
- Neon Serverless Postgres
- Hugging Face Inference (Qwen)
- FLELex / Beacco CEFR lexicon

## Deploying to Vercel

Import this GitHub repository in Vercel and keep the framework preset set to **Next.js**. The standard build command is `npm run build`; no output-directory override is required.

Connect a Neon database through Vercel Marketplace so that the project receives a `DATABASE_URL` environment variable. The app creates its `learned_words` table automatically on first use.

## License

No license has been specified.

### Vocabulary data attribution

CEFR validation uses **FLELex / Beacco** by François, Gala, Watrin & Fairon and Pintard & François, distributed by CENTAL, UCLouvain under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). This app uses the TreeTagger/Beacco edition (14,236 French lemmas, A1–C2) for educational, non-commercial use. [Official source](https://cental.uclouvain.be/cefrlex/flelex/download/).
