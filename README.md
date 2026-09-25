# Robot Hiểu Giọng Miền · Dialect-Aware Voice Robot (PTNK)

**VI —** Trang web trình diễn đề tài NCKH của nhóm **PTNK**: _Nâng cao chất lượng nhận dạng tiếng nói tiếng Việt đa phương ngữ: Kết hợp mô hình ASR tinh chỉnh trên bộ dữ liệu ViMD và mô-đun hiệu chỉnh hậu kỳ bằng mô hình ngôn ngữ lớn dùng để nhận diện phương ngữ vào các ứng dụng có giọng nói._ Bên trái là robot 3D **Ronaldo** làm theo lệnh tiếng Việt (mọi vùng miền, có dấu hoặc không dấu); bên phải là ô nhập lệnh. Kéo xuống để xem kết quả nghiên cứu (PhoWhisper-large tinh chỉnh trên ViMD: WER 7,84% trên tập kiểm tra).

**EN —** Showcase site for team **PTNK**'s research project _Improving Multi-Dialect Vietnamese Speech Recognition: Combining ViMD Fine-Tuned ASR Models with an LLM-Based Post-Correction Module to identify dialects used in voice-recognition apps_. On the left, a 3D robot named **Ronaldo** carries out Vietnamese commands (any regional variety, with or without diacritics). On the right is the command input. Scroll down for the research results (PhoWhisper-large fine-tuned on ViMD: 7.84% test WER).

> The **Audio** tab (record / upload speech → our ASR model) is built but disabled until the model backend is online. Right now commands are typed. See [Enable the Audio tab](#enable-the-audio-tab).

## Quick start

Requirements: **Node 24** (see `.nvmrc`).

```bash
npm ci
npm run dev
```

Open http://localhost:5173.

> **npm permission error (`EACCES … ~/.npm`)?** Your npm cache has files owned by root. Fix it once with
> `sudo chown -R 501:20 ~/.npm` (or run npm with `npm_config_cache=/tmp/npm-cache npm ci`).

## Scripts

| Command                   | What it does                                                  |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | Dev server with hot reload                                    |
| `npm run build`           | Type-check and build the static site into `dist/`             |
| `npm run preview`         | Serve the production build locally                            |
| `npm test`                | Unit and component tests (Vitest)                             |
| `npm run check`           | Type-check + lint (oxlint) + format check (Prettier) + tests  |
| `npm run extract:results` | Regenerate `src/content/results.json` from the dashboard HTML |

## How it works

```
text (or, later, audio → ASR) ──► command parser (NLU) ──► robot engine ──► 3D robot + room + speech bubble + voice
                                   rule-based, pluggable      plans & runs actions, replies, timers, weather
```

- **Parser** (`src/nlu`) — rule-based Vietnamese understanding in the browser: tone/diacritic normalization, a regional-word lexicon (Central, Nghệ Tĩnh, Southern: _chừ, rứa, mô, mần, hông, quẹo, mở đèn…_), Vietnamese number words, typo tolerance, chained commands ("nhảy 3 lần rồi vẫy tay"). It implements the `CommandParser` interface in `src/core/parser.ts`, so a Qwen/LLM parser can replace it without touching the UI.
- **Actions** (`src/core/actions.ts`) — the single JSON contract between parser and robot. Motion (jump, dance, wave, nod, walk, turn, sit…), information (time, date, lunar calendar, timers, weather, math), conversation, smart home (light, fan), and polite refusals for impossible requests.
- **Engine** (`src/engine`) — plans animations, runs them (new commands interrupt old ones), speaks replies with the browser's voice, owns timers and weather lookups.
- **Replies** (`src/replies`) — every robot sentence in Vietnamese and English, rendered from `{ key, params }` references so switching language re-renders the history.
- **3D scene** (`src/robot`) — three.js via React Three Fiber, lazy-loaded; falls back to a 2D robot when WebGL is unavailable.
- **Research section** (`src/features/research`) — every figure comes from `src/content/results.json`.

## Updating content

| What                                               | Where                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Robot name, site name, title, mentor, team members | `src/content/project.ts`                                                                                              |
| Zero-shot / +Qwen WER (hidden while `null`)        | `src/content/comparisons.ts`                                                                                          |
| Research numbers                                   | Re-export the dashboard to `public/reports/run-results-dashboard.html`, then `npm run extract:results` and `npm test` |
| New commands / regional words                      | `src/nlu/lexicon/*` (+ add cases to the parser tests)                                                                 |
| Robot sentences                                    | `src/replies/*`                                                                                                       |

## Enable the Audio tab

1. Deploy the ASR backend implementing the contract in [`docs/asr-api.md`](docs/asr-api.md) (`POST /transcribe`, multipart field `file` → `{ "text": "…" }`). It must be **HTTPS** and allow this site in **CORS**.
2. Set the environment variable `VITE_ASR_URL=https://your-asr-host` (Vercel/Netlify project settings, or `.env.local` for local dev) and **redeploy** — Vite inlines env vars at build time. See `.env.example`.
3. To try the audio UI without a backend in development: `VITE_ASR_MOCK=true npm run dev`.

Microphone access requires HTTPS (or `localhost`).

## Deploy

Both hosts auto-detect Vite (`npm run build` → `dist/`); `vercel.json` / `netlify.toml` only add caching and security headers.

- **Vercel:** import the repo → Framework preset _Vite_ → deploy.
- **Netlify:** import the repo → it reads `netlify.toml` → deploy.

## Browser support

Modern evergreen browsers (Chrome/Edge 111+, Safari/iOS 16.4+, Firefox 128+). Robot voice uses the device's Vietnamese text-to-speech voice when available (macOS/iOS "Linh", Edge "HoaiMy/NamMinh", Android Google TTS); otherwise the robot replies in text only.

## Credits & licences

- 3D robot **RobotExpressive** by Tomás Laulhé (Quaternius), modifications by Don McCurdy — CC0 1.0 (via the three.js examples).
- Weather data by [Open-Meteo.com](https://open-meteo.com/) — CC BY 4.0.
- **PhoWhisper** by VinAI Research — BSD-3-Clause. **ViMD** dataset (Dinh et al., EMNLP 2024) — CC BY-NC-ND 4.0; this is a non-commercial research site.
- Lunar calendar algorithm after Hồ Ngọc Đức.
- three.js, React, React Three Fiber, drei — MIT. Be Vietnam Pro, Nunito — SIL OFL 1.1. Lucide icons — ISC.
