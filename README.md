# Lindström ValueLens

A prototype dashboard for the **Lindström Customer Value & Sustainability Review**. A key account manager (KAM) uses it to prepare and run the annual review with a Customer. It shows the KPIs for service performance, sustainability and circularity, highlights opportunity signals, and exports the review as a PowerPoint deck.

All data is synthetic. It comes from the workbook in `data/raw/`.

## Features

- **Pages:** Overview, Sites, Opportunities, Customer priorities, and Data and assumptions.
- **Two views:** the *KAM view* includes internal signals and account health. The *Customer view* shows only customer-ready figures that have strong evidence behind them ([ADR 0009](docs/adr/0009-account-health-is-worst-of-and-kam-only.md), [ADR 0011](docs/adr/0011-customer-view-shows-only-strong-evidence.md)).
- **Period comparisons:** by default, H2 is compared with H1.
- **Languages:** English, Swedish and Finnish. The SV and FI texts are marked as AI translations.
- **Deck export:** a 12-slide `.pptx` built on the server with pptxgenjs. It always follows the Customer view.
- **AI assistant and observations:** a local Qwen3 4B model running in Ollama answers questions and writes observations. The model only calls KPI tools and never computes numbers itself ([ADR 0001](docs/adr/0001-llm-calls-kpi-tools-and-never-computes-numbers.md)).

There is no sign-in. The app runs as one fixed demo KAM (`lib/demo-kam.ts`), and it stores no KAM-entered values.

## Requirements

- **Node.js 24+.** Tests and the eval run TypeScript directly with `node`.
- **Python 3 with `openpyxl`.** Only needed to regenerate `data/processed/`.
- **Ollama.** Only needed for the AI assistant. You can use the stub instead (see below).
- **Docker.** Only needed to build the container image locally ([Docker](#docker)).

## Quick start

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. It redirects to `/overview`.

The processed JSON is committed, so the dashboard runs without Python or Ollama.

### AI assistant (Ollama)

```sh
ollama pull qwen3:4b-q8_0
ollama serve
```

The app calls Ollama at `http://127.0.0.1:11434` with a 16K context. After each call it checks that the model runs fully on the GPU, and warns if part of it is on the CPU. To fit the model in 8 GB of VRAM, set these before starting Ollama:

```sh
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0
```

Then run `ollama ps`. It should show `100% GPU`.

To work on the dashboard without a model, start it with canned replies:

```sh
ASSISTANT_STUB=1 npm run dev                # PowerShell: $env:ASSISTANT_STUB="1"; npm run dev
```

`ASSISTANT_STUB_DELAY_MS` sets how long the stub waits before it replies.

### Pointing at another Ollama

`OLLAMA_URL` sets where the app calls Ollama (default `http://127.0.0.1:11434`). `OLLAMA_HEADERS` is a JSON object of extra headers sent with each call, such as a tunnel's shared secret.

## Docker

The `Dockerfile` builds a Next.js standalone server on Node 24 (an image of about 330 MB). The server listens on port 8080. It also copies in `data/processed/` and `public/`, which the app reads from disk at runtime. The image runs as any UID in group 0, which is how OpenShift starts containers. Ollama is not in the image.

```sh
docker build -t valuelens .
docker run --rm -p 8080:8080 -u 123456:0 -e ASSISTANT_STUB=1 valuelens     # http://localhost:8080
```

| Variable | Effect |
| --- | --- |
| `ASSISTANT_STUB=1` | Canned assistant replies, no model needed |
| `OLLAMA_URL` | Where the model is, e.g. a tunnel URL |
| `OLLAMA_HEADERS` | JSON headers sent with each model call, e.g. `{"X-Gate-Key":"..."}` |

## Deploy (OpenShift Developer Sandbox)

The Sandbox has no GPU and a fixed quota that cannot be raised. So the image holds only the app, and the model keeps running on your own GPU machine, reached through a tunnel that is guarded by a shared secret:

```
browser → Sandbox route → app pod → https://<random>.trycloudflare.com → ollama-gate (checks X-Gate-Key) → Ollama on your GPU
```

**1. On the GPU machine** (three terminals, all running for the whole demo):

```sh
OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
GATE_KEY=<long random secret> node scripts/ollama-gate.mjs     # 401 unless X-Gate-Key matches
cloudflared tunnel --url http://127.0.0.1:11435                # prints https://<random>.trycloudflare.com
```

In PowerShell, set the variables first: `$env:OLLAMA_FLASH_ATTENTION="1"; $env:OLLAMA_KV_CACHE_TYPE="q8_0"; ollama serve` and `$env:GATE_KEY="<secret>"; node scripts/ollama-gate.mjs`. Check that `ollama ps` shows `100% GPU`.

**2. On the Sandbox.** Install `oc` (`choco install openshift-cli`, or from the console's *?* → *Command line tools*), then log in with the console's *Copy login command*. OpenShift builds the `Dockerfile` straight from the public GitHub repository:

```sh
oc new-app https://github.com/Khashiiiiiii/lindstrom-valuelens.git --strategy=docker --name=valuelens
oc logs -f bc/valuelens        # if the build is OOMKilled: oc patch bc/valuelens -p '{"spec":{"resources":{"limits":{"memory":"2Gi"}}}}' && oc start-build valuelens
oc create secret generic valuelens-ollama   --from-literal=OLLAMA_URL=https://<random>.trycloudflare.com   --from-literal=OLLAMA_HEADERS='{"X-Gate-Key":"<same secret>"}'
oc set env deployment/valuelens --from=secret/valuelens-ollama
oc set resources deployment/valuelens --requests=cpu=200m,memory=256Mi --limits=cpu=1,memory=1Gi
oc create route edge valuelens --service=valuelens --port=8080-tcp
oc get route valuelens         # the public https URL
```

**After a push**, rebuild with `oc start-build valuelens --follow`. The deployment rolls out the new image by itself.

**Troubleshooting**

- *The assistant says the model is unreachable.* The tunnel or gate is down, or the secret does not match. Test it from your machine with `curl -H "X-Gate-Key: <secret>" https://<random>.trycloudflare.com/api/version`.
- *The tunnel URL changed.* This happens every time cloudflared restarts. Update `OLLAMA_URL` in the secret, then run `oc rollout restart deployment/valuelens`.
- *The app is gone after a quiet spell.* The Sandbox scales idle deployments down after about 12 hours. Run `oc scale deployment/valuelens --replicas=1`.
- *Running without the model.* Run `oc set env deployment/valuelens ASSISTANT_STUB=1`.
- *Finished with it.* Run `oc delete all -l app=valuelens` and `oc delete secret valuelens-ollama`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Next.js dev server |
| `npm run build` / `npm start` | Makes a production build and serves it |
| `npm test` | Runs the Node test runner over `lib/` and `app/` |
| `npm run typecheck` | Runs `tsc --noEmit` |
| `npm run eval -- --runs 5` | Runs the demo prompts through the real model and scores each one. Needs Ollama. |
| `npm run preprocess` | Rebuilds `data/processed/*.json` from the workbook |

### Data pipeline

```sh
python -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt      # Windows: .venv\Scripts\pip
npm run preprocess                                     # Windows: .venv\Scripts\python scripts/preprocess.py
```

The same workbook always produces byte-identical JSON. Each file records the workbook's SHA-256 in `meta.source_sha256`. Run the pipeline tests with `pytest scripts/`.

## Project layout

```
app/              Next.js pages, API routes (app/api/*) and UI components
lib/data/         Typed access to the processed JSON and the KPI calculations
lib/pages/        Builds the data for each page and the deck
lib/assistant/    Ollama client, tools, answer and observation runners, checks, stub, eval
lib/i18n/         EN / SV / FI dictionary
scripts/          Python preprocessing pipeline (workbook → JSON)
data/raw/         Source workbook (synthetic)
data/processed/   Generated JSON the app reads
docs/adr/         Architecture decision records
GLOSSARY.md       Domain vocabulary: Customer, Site, KAM, views, KPIs
```

## Further reading

- [`GLOSSARY.md`](GLOSSARY.md) defines the terms used throughout the code and UI.
- [`docs/adr/`](docs/adr/) explains why the KPIs and views work the way they do.
- [`public/SOURCE.md`](public/SOURCE.md) gives the logo source and license (CC BY-SA 4.0).
