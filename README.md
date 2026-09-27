# Robot Hiểu Giọng Miền · Dialect-Aware Voice Robot (PTNK)

**VI —** Trang web trình diễn đề tài NCKH của nhóm **PTNK**: _Nâng cao chất lượng nhận dạng tiếng nói tiếng Việt đa phương ngữ: Kết hợp mô hình ASR tinh chỉnh trên bộ dữ liệu ViMD và mô-đun hiệu chỉnh hậu kỳ bằng mô hình ngôn ngữ lớn dùng để nhận diện phương ngữ vào các ứng dụng có giọng nói._ Bên trái là robot 3D **Ronaldo** làm theo lệnh tiếng Việt (mọi vùng miền, có dấu hoặc không dấu); bên phải là ô nhập lệnh. Kéo xuống để xem kết quả nghiên cứu (PhoWhisper-large tinh chỉnh trên ViMD: WER 7,84% trên tập kiểm tra).

**EN —** Showcase site for team **PTNK**'s research project _Improving Multi-Dialect Vietnamese Speech Recognition: Combining ViMD Fine-Tuned ASR Models with an LLM-Based Post-Correction Module to identify dialects used in voice-recognition apps_. On the left, a 3D robot named **Ronaldo** carries out Vietnamese commands (any regional variety, with or without diacritics). On the right is the command input. Scroll down for the research results (PhoWhisper-large fine-tuned on ViMD: 7.84% test WER).

> The **Audio** tab (record / upload speech → our ASR model) turns on when `VITE_ASR_URL` is set. The model runs on the team's GPU machine, not on Vercel; while that machine is off, the tab says so and commands are typed. See [Enable the Audio tab](#enable-the-audio-tab).

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
                                          │  moves it has no animation for
                                          ▼
                              /api/motion → Qwen invents a keyframed move → compiled onto the skeleton
```

- **Parser** (`src/nlu`) — rule-based Vietnamese understanding in the browser: tone/diacritic normalization, a regional-word lexicon (Central, Nghệ Tĩnh, Southern: _chừ, rứa, mô, mần, hông, quẹo, mở đèn…_), Vietnamese number words, typo tolerance, chained commands ("nhảy 3 lần rồi vẫy tay"). It implements the `CommandParser` interface in `src/core/parser.ts`, so a Qwen/LLM parser can replace it without touching the UI.
- **Actions** (`src/core/actions.ts`) — the single JSON contract between parser and robot. Motion (jump, dance, wave, nod, walk, turn, sit…), information (time, date, lunar calendar, timers, weather, math), conversation, smart home (light, fan), and polite refusals for impossible requests.
- **Engine** (`src/engine`) — plans animations, runs them (new commands interrupt old ones), speaks replies with the browser's voice, owns timers and weather lookups.
- **Replies** (`src/replies`) — every robot sentence in Vietnamese and English, rendered from `{ key, params }` references so switching language re-renders the history.
- **AI-invented moves** (`src/motion`, `src/server`, `api/motion.ts`) — commands the rules cannot act out ("moonwalk đi", "lộn nhào", "nhắm một mắt", "đi như con cua", miming "ăn chuối") go to Qwen, which writes a short keyframed move; the robot compiles it onto its skeleton (floor contact, flips about the hips, per-eye/brow controls). See [AI moves (Qwen)](#ai-moves-qwen).
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
| AI-move prompt, pose cookbook, joint ranges        | `src/server/motionPrompt.ts`, `src/motion/script.ts` (bump `MOTION_PROMPT_VERSION` when a move's meaning changes)     |
| Which commands go to Qwen                          | `src/features/demo/escalate.ts` (+ its tests)                                                                         |

## Enable the Audio tab

1. Run the ASR backend implementing the contract in [`docs/asr-api.md`](docs/asr-api.md) (`POST /transcribe`, multipart field `file` → `{ "text": "…" }`; `GET /health`). It must be **HTTPS** and allow this site in **CORS**. The team runs PhoWhisper-large on its own RTX 3060 and publishes it with **Tailscale Funnel** (`https://<machine>.<tailnet>.ts.net`, a fixed URL); the backend's `public.ps1` starts it in a locked-down public mode (only `/transcribe` and `/health`, rate-limited).
2. Set the environment variable `VITE_ASR_URL=https://your-asr-host` (Vercel project settings, for **Production and Preview**, or `.env.development.local` for local dev — not `.env.local`, which the tests would read too) and **redeploy** — Vite inlines env vars at build time. See `.env.example`.
3. While the backend is down, the Voice tab shows "Tạm nghỉ" instead of failing after a recording (it checks `GET /health`).
4. To try the audio UI without a backend in development: `VITE_ASR_MOCK=true npm run dev`.

Microphone access requires HTTPS (or `localhost`). Browser echo cancellation / noise suppression / auto gain are on; `VITE_ASR_MIC_DSP=false` records the raw microphone signal instead.

## AI moves (Qwen)

Ronaldo's 13 built-in animations cover the common commands. For anything else that is a body or face action, the site asks **Qwen** (Alibaba Cloud Model Studio) to invent the move on the fly:

1. The rule parser runs first (instant, offline). A clause goes to Qwen only if nothing matched ("moonwalk đi", "lộn nhào", "nhắm một mắt"), it was refused as physically impossible and can be mimed ("bay lên trời", "ăn chuối", "chơi đàn"), or it is a twist on a known move ("nhảy moonwalk", "vẫy tay trái", "đi như con cua"). Time, weather, timers, chat, the lamp/fan, unsafe requests and negated commands never do.
2. While Qwen works (a few seconds) the robot faces you with a hand on its chin and says "Để mình nghĩ động tác…". Moves already received are replayed instantly (browser cache, and a per-instance server cache).
3. `POST /api/motion` (a Vercel function, `api/motion.ts` → `src/server/motionHandler.ts`) calls Qwen in JSON mode, validates and clamps the result (joint ranges, floor, room bounds, ≤ 16 s), asks once more if the JSON is unusable, and returns a move. It rate-limits each visitor and never logs what people type.
4. The robot compiles the move onto its skeleton and plays it; the chip gets a "Qwen tạo động tác" badge. If Qwen fails, the robot does what it did before: the built-in move, today's refusal, "chưa hiểu", or "Mình chưa nghĩ ra động tác này".

**Set it up (Vercel):**

1. In [Alibaba Cloud Model Studio](https://modelstudio.alibabacloud.com/) (Singapore region), create an API key. Your workspace endpoint is shown next to it.
2. In Vercel → Project → Settings → Environment Variables add **`DASHSCOPE_API_KEY`** (and optionally `QWEN_BASE_URL` = your workspace endpoint, `QWEN_MODEL`). These are server-side variables: never prefix them with `VITE_`.
3. Redeploy. The site checks `GET /api/motion`; without a key (or on Netlify / `vite preview`, which have no function) the feature stays off and nothing changes.

Local dev: put the same variables in `.env.local` and run `npm run dev` (a dev-only middleware serves `/api/motion`). To try the UI without a key: `VITE_MOTION_MOCK=true npm run dev` (canned moonwalk, backflip, lộn nhào, nháy mắt).

**Cost & limits:** `qwen3.7-plus` costs about $0.003–0.01 per brand-new move (new Model Studio accounts get 1M free tokens for 90 days). Each visitor can ask for 6 new moves a minute and 60 a day per server instance; set `MOTION_AI_ENABLED=false` to switch it off without removing the key. Moves always end back in the normal standing pose, stay inside the room, and are cartoon-like approximations — the robot has no mouth and cannot hold real objects (props are mimed).

**Privacy:** commands the robot does not know are sent to Qwen (Alibaba Cloud) — the site says so under the command box when the feature is on.

## Deploy

Both hosts auto-detect Vite (`npm run build` → `dist/`); `vercel.json` / `netlify.toml` only add caching and security headers.

- **Vercel:** import the repo → Framework preset _Vite_ → deploy. Vercel also deploys `api/motion.ts` (AI moves; off until `DASHSCOPE_API_KEY` is set).
- **Netlify:** import the repo → it reads `netlify.toml` → deploy.

## Browser support

Modern evergreen browsers (Chrome/Edge 111+, Safari/iOS 16.4+, Firefox 128+). Robot voice uses the device's Vietnamese text-to-speech voice when available (macOS/iOS "Linh", Edge "HoaiMy/NamMinh", Android Google TTS); otherwise the robot replies in text only.

## Credits & licences

- 3D robot **RobotExpressive** by Tomás Laulhé (Quaternius), modifications by Don McCurdy — CC0 1.0 (via the three.js examples).
- Weather data by [Open-Meteo.com](https://open-meteo.com/) — CC BY 4.0.
- AI-invented moves by **Qwen** (Alibaba Cloud Model Studio).
- **PhoWhisper** by VinAI Research — BSD-3-Clause. **ViMD** dataset (Dinh et al., EMNLP 2024) — CC BY-NC-ND 4.0; this is a non-commercial research site.
- Lunar calendar algorithm after Hồ Ngọc Đức.
- three.js, React, React Three Fiber, drei — MIT. Be Vietnam Pro, Nunito — SIL OFL 1.1. Lucide icons — ISC.
