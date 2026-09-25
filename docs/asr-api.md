# ASR backend API (for the website's Audio tab)

The website's **Giọng nói / Voice** tab records speech (or takes an uploaded file) and sends it to a
speech-recognition backend running **PhoWhisper-large fine-tuned on ViMD**. The tab is already
built. It turns on when the site is built with `VITE_ASR_URL` set.

This document is the contract between the website (`src/audio/asrClient.ts`) and that backend.
A minimal FastAPI server that implements it is at the end.

---

## 1. `POST /transcribe`

```
POST {VITE_ASR_URL}/transcribe
Content-Type: multipart/form-data; boundary=…   (set by the browser)

file   (required)  the audio
```

**What the browser sends in `file`**

| Case                                                               | Content                                                                                           | Filename                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Normal (the browser could decode the audio)                        | `audio/wav`, **16 kHz, mono, PCM 16-bit**, ≤ 30 s                                                 | `recording.wav`                                                         |
| Fallback (the browser could not decode it, e.g. `.m4a` on Firefox) | the **original** file as the user chose it: `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/ogg`… | the original name, or `recording.webm` / `.ogg` / `.m4a` for recordings |

The server must therefore decode arbitrary audio with ffmpeg, not only WAV. The client never resamples
with its own filter; if its 16 kHz conversion fails, it uploads the original.

- The request has **no custom headers** and no manual `Content-Type`, so it is a CORS "simple request"
  with no preflight. Please don't require an API key header. Anything prefixed `VITE_` is public anyway.
- Client limits: recordings stop at **30 s** and must be **≥ 0.5 s**. Files are checked against
  **`VITE_ASR_MAX_UPLOAD_MB`** (default 10 MB) and a whitelist (`wav mp3 m4a webm ogg`). Longer files
  are offered as "use the first 30 s" and trimmed before upload.
- The client times out after **`VITE_ASR_TIMEOUT_MS`** (default 45 s). The user can also cancel.

### Response 200 (`application/json`)

```json
{
  "text": "chừ mấy giờ rồi rứa",
  "duration": 2.41,
  "corrected_text": "bây giờ mấy giờ rồi vậy",
  "alternatives": ["chừ mấy giờ rồi rứa", "chừ mấy giờ rồi hả"]
}
```

| Field            | Required | Meaning                                                                                                                                                                                              |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`           | **yes**  | Raw ASR transcript (string). It stays the raw model output, even once Qwen correction exists.                                                                                                        |
| `duration`       | no       | Audio length in seconds, measured by the server.                                                                                                                                                     |
| `corrected_text` | no       | **Future** Qwen post-correction. When it is present and non-empty, the robot acts on it instead of `text`. The UI shows both lines, and the pipeline's "Qwen" step switches from "sắp có" to "xong". |
| `alternatives`   | no       | **Future** n-best hypotheses (e.g. 5-beam). The command parser may use them to pick the most understandable one.                                                                                     |

Extra fields are ignored, so you can add things like `model` or `processing_ms` freely. Text is
truncated to 200 characters on the client.

The model was trained with `expand_numbers: true`, so it writes numbers **as words** ("ba lần", "năm cộng
ba"). The command parser handles Vietnamese number words.

### Errors

Return FastAPI-style JSON: `{"detail": "message"}`. The validation-array form
(`{"detail": [{"loc": …, "msg": …, "type": …}]}`) is accepted too. `detail` is logged, not shown to users.
The UI shows its own friendly text for each case.

| Status                                       | When                                                                          | What the user sees               |
| -------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| 400                                          | no `file` field                                                               | generic error                    |
| 413                                          | file larger than the server limit (10 MB)                                     | "file too large"                 |
| 415                                          | audio could not be decoded                                                    | "unsupported audio"              |
| 422                                          | empty audio, or shorter than 0.3 s / longer than 30 s                         | "couldn't process the audio"     |
| 429 / 503                                    | busy or model still loading. **Send `Retry-After`** (seconds or an HTTP date) | "server busy, try again shortly" |
| 5xx                                          | anything else                                                                 | generic error                    |
| 200 without a string `text`, or invalid JSON |                                                                               | "unexpected response"            |
| network failure                              | offline, DNS, **CORS rejected**, **mixed content**, TLS error                 | "couldn't reach the server"      |

A browser reports CORS and mixed-content failures only as a generic network error. If the site says
"couldn't reach the server" but `curl` works, check CORS and HTTPS first.

### Optional: `GET /health`

`{"status": "ok", "model": "phowhisper-large-vimd@checkpoint-1750", "device": "cuda"}`. The site does
not call it in v1, but it's useful for uptime checks.

---

## 2. Deployment rules (the part that usually breaks)

1. **HTTPS only.** The site is served over HTTPS (Vercel/Netlify). Browsers block an `http://` backend
   as **mixed content**, so the fetch fails as a network error. Use a certificate, or a tunnel that
   provides one.
2. **CORS.** Allow these origins:
   - the production site, e.g. `https://<site>.vercel.app` or your custom domain;
   - preview deployments: `https://<anything>.vercel.app` and `https://<anything>.netlify.app`, which
     need a regex because the subdomain changes with each deploy;
   - local development: `http://localhost:5173`.

   Allow `POST`, plus `GET` for `/health`. With no custom headers there is no preflight, but it is fine to
   answer `OPTIONS` anyway (CORSMiddleware does).

3. **Private networks / LAN GPUs.** A backend on a private IP (e.g. `http://192.168.1.20:8000`) is
   blocked twice: once as mixed content, and again by Chrome's **Local Network Access** rules (a public
   page reaching a private address is blocked or triggers a permission prompt). Expose the GPU machine
   through a public HTTPS URL instead: **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:8000`),
   **ngrok**, or host it on **Hugging Face Spaces** (GPU).
4. **Microphone.** The browser only allows `getUserMedia` on HTTPS or `localhost`. Opening the dev
   server by LAN IP (`http://192.168.x.x:5173`) disables recording; file upload still works.
5. **Privacy.** Don't store uploaded audio, and don't log transcripts together with IP addresses. The
   website does **not** yet say "audio is not stored"; add that text only once the backend team
   confirms it.

---

## 3. Turning the Audio tab on (website side)

The website reads these **build-time** Vite variables (see `.env.example`):

| Variable                 | Default   | Meaning                                                                                                                                                               |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_ASR_URL`           | _(empty)_ | Base URL of this API, e.g. `https://asr.example.org`. Trailing slashes are ignored. **Setting it enables the Audio tab.**                                             |
| `VITE_ASR_ENABLED`       | _(unset)_ | Optional kill switch: `false` keeps the tab disabled even when the URL is set.                                                                                        |
| `VITE_ASR_TIMEOUT_MS`    | `45000`   | Client timeout per request.                                                                                                                                           |
| `VITE_ASR_MAX_UPLOAD_MB` | `10`      | Client-side file size limit. Keep it ≤ the server limit.                                                                                                              |
| `VITE_ASR_MOCK`          | `false`   | **Dev only** (`npm run dev`): a fake transcriber with canned Vietnamese answers, so the UI can be tried without a GPU. It can never be enabled in a production build. |

**Vite inlines `VITE_*` values when the site is built.** Changing them in the Vercel/Netlify dashboard
has no effect until you **redeploy**. Every `VITE_*` value is visible to anyone who opens the page, so
never put a secret in one.

Local test against a running backend:

```bash
echo 'VITE_ASR_URL=https://your-tunnel.trycloudflare.com' > .env.local
npm run dev            # http://localhost:5173, which must be in the backend's CORS list
```

Quick backend check without the website:

```bash
curl -F "file=@sample.wav" https://your-asr-host/transcribe
```

---

## 4. FastAPI reference server

Requirements: `pip install fastapi "uvicorn[standard]" python-multipart transformers torch librosa soundfile`,
plus the **`ffmpeg`** binary on `PATH` (for webm/ogg/m4a/mp3).

Notes on the choices below:

- **The upload is written to a temporary file.** `librosa.load(io.BytesIO(...))` can only read formats
  that libsndfile understands (wav, flac, ogg-vorbis). The browser's **webm/opus** and **m4a** need the
  audioread/ffmpeg path, which needs a real file path. The temp file is deleted right away, so no audio
  is kept.
- **`torch.bfloat16`** matches the dtype the model was fine-tuned in. Fall back to float32 on CPU.
- **`num_beams=5`, `language="vi"`, `task="transcribe"`**, matching the evaluated setup (5-beam WER).
- **`allow_origin_regex`** is pinned to _this project's own_ Vercel/Netlify preview hosts (fill in
  the two placeholder slugs below) — a regex like `vercel\.app|netlify\.app` with no project slug
  would let any tenant on those platforms call this GPU server from a browser. Starlette matches
  `allow_origin_regex` with `re.fullmatch` (the whole `Origin` header must match end-to-end), so the
  pattern below is implicitly anchored — do not add a leading/trailing `.*`. `allow_origins` lists
  the fixed, non-preview ones.

```python
"""ASR server for the PTNK dialect-robot website. Contract: docs/asr-api.md."""
import os
import tempfile
import time

import librosa
import torch
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline

MODEL_PATH = os.environ.get("ASR_MODEL", "/models/phowhisper-large-vimd/checkpoint-1750")
MAX_BYTES = 10 * 1024 * 1024        # keep ≥ VITE_ASR_MAX_UPLOAD_MB on the website
CONTENT_LENGTH_SLACK = 64 * 1024    # multipart boundary/header overhead on top of the file itself
MIN_SEC, MAX_SEC = 0.3, 30.5
SR = 16_000

# TODO(team): replace both placeholders before deploying.
#   VERCEL_PROJECT_SLUG  = Vercel dashboard → Project → Settings → General → "Project Name"
#                          (the exact string every deployment URL is built from).
#   NETLIFY_SITE_SLUG    = Netlify dashboard → Site settings → General → "Site name"
#                          (the <slug> in https://<slug>.netlify.app).
VERCEL_PROJECT_SLUG = "VERCEL_PROJECT_SLUG"
NETLIFY_SITE_SLUG = "NETLIFY_SITE_SLUG"

app = FastAPI(title="PhoWhisper-ViMD ASR")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://your-site.vercel.app",           # production (and/or your custom domain)
    ],
    allow_origin_regex=(
        rf"https://({VERCEL_PROJECT_SLUG}(-git-[a-z0-9-]+-[a-z0-9-]+)?\.vercel\.app"
        rf"|(deploy-preview-\d+--|[a-z0-9-]+--)?{NETLIFY_SITE_SLUG}\.netlify\.app)"
    ),  # this project's own preview deploys only — see note above (re.fullmatch semantics)
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)

use_cuda = torch.cuda.is_available()
asr = pipeline(
    "automatic-speech-recognition",
    model=MODEL_PATH,
    device=0 if use_cuda else -1,
    torch_dtype=torch.bfloat16 if use_cuda else torch.float32,
)


@app.get("/health")
def health():
    return {"status": "ok", "model": os.path.basename(MODEL_PATH), "device": "cuda" if use_cuda else "cpu"}


@app.post("/transcribe")
def transcribe(request: Request, file: UploadFile = File(...)):
    # `def` (not `async def`): FastAPI runs sync endpoints in a worker thread, so librosa's decode
    # and the model's inference below don't block the event loop — /health and other concurrent
    # requests stay responsive during a transcription.

    # Reject oversized uploads from the Content-Length header before reading anything, so a
    # multi-GB POST can't be spooled to disk and then loaded fully into memory just to fail a
    # length check. (No default body-size limit in Starlette/python-multipart.)
    content_length = request.headers.get("content-length")
    if content_length is not None and int(content_length) > MAX_BYTES + CONTENT_LENGTH_SLACK:
        raise HTTPException(413, "File too large")

    # Read with a hard cap even when Content-Length is absent/wrong (chunked bodies, lying clients).
    data = file.file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(422, "Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")

    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    # delete=False: on Windows a NamedTemporaryFile's path can't be reopened while the handle is
    # still open, so librosa.load(tmp.name) would fail there with delete=True. Close it ourselves,
    # let librosa reopen it by path, then always remove it in `finally` (the audio never outlives
    # this request — we do not store user audio).
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        try:
            # librosa falls back to audioread → ffmpeg for webm/ogg-opus/m4a/mp3 (needs a file path).
            audio, _ = librosa.load(tmp.name, sr=SR, mono=True)
        except Exception:
            raise HTTPException(415, "Unsupported or corrupt audio")
    finally:
        os.unlink(tmp.name)

    duration = len(audio) / SR
    if duration < MIN_SEC or duration > MAX_SEC:
        raise HTTPException(422, f"Audio must be {MIN_SEC}–30 s (got {duration:.1f} s)")

    t0 = time.perf_counter()
    out = asr(
        {"raw": audio, "sampling_rate": SR},
        generate_kwargs={"language": "vi", "task": "transcribe", "num_beams": 5},
    )
    return {
        "text": out["text"].strip(),
        "duration": round(duration, 3),
        "processing_ms": int((time.perf_counter() - t0) * 1000),
        # Future: "corrected_text": qwen_correct(text), "alternatives": [...]
    }
```

Run it with `uvicorn server:app --host 0.0.0.0 --port 8000`, then expose it over HTTPS (§2).

To return **429/503 with `Retry-After`** while the model is still loading, or when a request queue is
full: `raise HTTPException(503, "Model loading", headers={"Retry-After": "20"})`.

### Future endpoints (not used by the site yet)

- `POST /correct` with `{"text": "…"}` returns `{"corrected_text": "…"}`, so typed commands could go
  through Qwen too.
- `POST /parse` would host an LLM intent parser. The site already has a switch for it (`VITE_NLU_ENGINE=llm`).
