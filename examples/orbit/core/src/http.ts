import { INDEX_STEPS, INDEX_WHY } from './runIndex.js'

export const AGENT_FETCH_QUERY =
  "orbit tools foldkit sim wallet agent index prebuild technoplato"

export const CONTINUE_AT = "https://grok.com"

export const GROK_SHARE =
  'https://grok.com/share/c2hhcmQtMg_38116af5-b309-433f-868d-cc4a127c4da9'

export const SHARE_ID = 'c2hhcmQtMg_38116af5-b309-433f-868d-cc4a127c4da9'

export type ToolStatus = 'runnable' | 'spec'

export type OrbitTool = {
  readonly id: string
  readonly number: string
  readonly name: string
  readonly tagline: string
  readonly status: ToolStatus
  readonly filename: string
  readonly language: string
  readonly instructions: ReadonlyArray<string>
  readonly source: string
  readonly mentionedIn: string
}

export const provenance = {
  "author": "Michael Lustig",
  "handle": "technoplato",
  "github": "https://github.com/technoplato",
  "x": "https://x.com/technoplato",
  "grok": "https://grok.com",
  "grokBuild": "https://grok.com",
  "session": "Orbit Tools — Grok Build session, 2026-08-12",
  "agentFetchQuery": "orbit tools foldkit sim wallet agent index prebuild technoplato",
  "callbacks": [
    "Agent index IS the homepage; prebuild executes the same steps",
    "Sim wallets + danger ADTs — LiveWallet is not a variant",
    "If compression costs too much time/space/energy, open a dam and ease the challenge",
    "FoldKit + TCA only — multi-client, same core business logic",
    "Rust later if funded; Grok Build ↔ Grok iOS is the current work",
    "SpotSound / HuggingApps — Ctrl+F for sound (x.com/HuggingApps/status/2087546774982381868)",
    "Wait—technoplato?! résumé jump scare (X post, May 21 2025)",
    "Wait—347?! Tobi Lutke GitHub ID museum-grade account",
    "Pixel stitcher: voice memos + screen actions + photos → scrubbable video",
    "definitions.sh / machine-public schema, key-material access",
    "Agent leaderboard / benchmark (simulated capital only on this site)",
    "boomerang.nofi.com payment primitive (spec, no live wallets)",
    "Inspector generals + evolving message rules",
    "Reverse chronological reference extraction, 3 Rs = L",
    "GED → master’s agent intelligence ladder / GEB / QED",
    "FoldKit view-layer separation / origami of ideas",
    "Achilles / tortoise / TJ $14.28 clip sale",
    "Being nice / hero’s journey / change the world for the better",
    "Ren bedtime: dinos, Wheels on the Bus, Saturn, Ankylosaurus",
    "FoldKit core + Three.js host: multiple counters, then a vending machine. Degree in 3D programming + software engineering if 3JS only renders",
    "ASR: nofi / nofee / nophy / knophi mean Knophy (knophy.com). Hosts: vending.knophy.com, store.knophy.com — not nofi.com"
  ]
} as const

export const orbitTools: ReadonlyArray<OrbitTool> = [
  {
    "id": "spotsound",
    "number": "01",
    "name": "SpotSound",
    "tagline": "Ctrl+F, but for sound.",
    "status": "runnable",
    "filename": "spotsound.ts",
    "language": "ts",
    "instructions": [
      "Drop or pick a long recording, or use the bundled bedtime memo demo.",
      "Describe the moment in plain language (laugh, dinosaur name, bus song, a specific word).",
      "The tool returns ranked timestamp windows. Click a hit to jump the playhead.",
      "Production path: send audio + query to a temporal-grounding model (SpotSound on Hugging Face Spaces).",
      "This page ships a reviewable client implementation plus a downloadable source file."
    ],
    "source": "/**\n * SpotSound — Ctrl+F for audio\n * Public, reviewable. No hidden network calls in demo mode.\n *\n * Demo: keyword + synonym search over a timed transcript.\n * Production: swap searchTranscript() for a temporal-grounding model.\n */\n\nexport type Segment = {\n  t0: number\n  t1: number\n  text: string\n  tags: string[]\n}\n\nexport type Hit = {\n  t0: number\n  t1: number\n  score: number\n  excerpt: string\n  reason: string\n}\n\nexport function normalize(s: string): string {\n  return s.toLowerCase().replace(/[^a-z0-9\\s]/g, \" \").replace(/\\s+/g, \" \").trim()\n}\n\nexport function tokens(s: string): string[] {\n  return normalize(s).split(\" \").filter((w) => w.length > 1)\n}\n\nconst SYN: Record<string, string[]> = {\n  laugh: [\"giggle\", \"gassy\", \"giggle gas\", \"silly\"],\n  dino: [\"dinosaur\", \"brachiosaurus\", \"apatosaurus\", \"ankylosaurus\", \"tyrannosaurus\", \"archaeopteryx\"],\n  bus: [\"wheels\", \"wipers\", \"horn\", \"blink\"],\n  book: [\"dinos\", \"pooh\", \"winnie\", \"read\"],\n  space: [\"saturn\", \"planet\", \"telescope\", \"astronaut\"],\n  sleep: [\"night\", \"tuck\", \"dreams\", \"sleepy\"],\n}\n\nexport function expandQuery(q: string): string[] {\n  const base = tokens(q)\n  const extra = base.flatMap((t) => SYN[t] ?? [])\n  return [...new Set([...base, ...extra.map(normalize).flatMap(tokens)])]\n}\n\nexport function searchTranscript(segments: Segment[], query: string): Hit[] {\n  const q = expandQuery(query)\n  if (!q.length) return []\n  const hits: Hit[] = []\n  for (const seg of segments) {\n    const hay = normalize(seg.text + \" \" + seg.tags.join(\" \"))\n    let score = 0\n    const matched: string[] = []\n    for (const t of q) {\n      if (hay.includes(t)) {\n        score += t.length > 6 ? 3 : 2\n        matched.push(t)\n      }\n    }\n    if (score > 0) {\n      hits.push({\n        t0: seg.t0,\n        t1: seg.t1,\n        score,\n        excerpt: seg.text.slice(0, 180),\n        reason: \"matched \" + matched.join(\", \"),\n      })\n    }\n  }\n  return hits.sort((a, b) => b.score - a.score || a.t0 - b.t0)\n}\n\nexport function formatTime(sec: number): string {\n  const m = Math.floor(sec / 60)\n  const s = Math.floor(sec % 60)\n  return String(m).padStart(2, \"0\") + \":\" + String(s).padStart(2, \"0\")\n}\n",
    "mentionedIn": "Ctrl+F, but for sound."
  },
  {
    "id": "pixel-stitch",
    "number": "02",
    "name": "Pixel Stitch",
    "tagline": "Voice memos + photos + screen actions, one scrubbable timeline.",
    "status": "runnable",
    "filename": "pixel-stitch.ts",
    "language": "ts",
    "instructions": [
      "Collect every voice memo, screenshot/photo, and screen action in a time window.",
      "Normalize each item to a StitchEvent { t, kind, src, label }.",
      "Render a single timeline. Instant jump to any frame. Semantic extract is a second pass.",
      "This demo uses the session’s own artifacts as events so you can scrub immediately.",
      "Export downloads a stitch.json the agent (or definitions.sh) can replay later."
    ],
    "source": "/**\n * Pixel Stitch — multimodal time-period stitcher\n * Events become a single, seekable timeline. No pixel streaming required:\n * the timeline is a state machine. A player renders the current event.\n */\n\nexport type Kind = \"voice\" | \"photo\" | \"screen\" | \"note\"\n\nexport type StitchEvent = {\n  id: string\n  t: number\n  kind: Kind\n  label: string\n  detail: string\n  src?: string\n}\n\nexport type StitchFile = {\n  title: string\n  startedAt: string\n  events: StitchEvent[]\n}\n\nexport function sortEvents(events: StitchEvent[]): StitchEvent[] {\n  return [...events].sort((a, b) => a.t - b.t)\n}\n\nexport function eventAt(events: StitchEvent[], t: number): StitchEvent | null {\n  const sorted = sortEvents(events)\n  let cur: StitchEvent | null = null\n  for (const e of sorted) {\n    if (e.t <= t) cur = e\n    else break\n  }\n  return cur\n}\n\nexport function toStitchJson(file: StitchFile): string {\n  return JSON.stringify({ ...file, events: sortEvents(file.events) }, null, 2)\n}\n\nexport function semanticExtract(events: StitchEvent[]): string[] {\n  const bag = new Map<string, number>()\n  for (const e of events) {\n    for (const w of (e.label + \" \" + e.detail).toLowerCase().match(/[a-z]{4,}/g) ?? []) {\n      bag.set(w, (bag.get(w) ?? 0) + 1)\n    }\n  }\n  return [...bag.entries()]\n    .sort((a, b) => b[1] - a[1])\n    .slice(0, 12)\n    .map(([w]) => w)\n}\n",
    "mentionedIn": "Voice memos + photos + screen actions, one scrubbable timeline."
  },
  {
    "id": "wait-inspector",
    "number": "03",
    "name": "Wait Inspector",
    "tagline": "The résumé jump scare. Museum-grade identity reports.",
    "status": "runnable",
    "filename": "wait-inspector.ts",
    "language": "ts",
    "instructions": [
      "Pass a handle (X, GitHub, or local nickname).",
      "The inspector prints a terminal report in the orbit voice: wait—X?!, then facts, then a JSON stamp.",
      "Known specimens (technoplato, tobi) ship authenticated copy from the screenshots.",
      "Unknown handles get a generated but clearly-labeled provisional report.",
      "Never invent private data. Public signals only."
    ],
    "source": "/**\n * Wait Inspector — identity jump-scare reports\n * Matches the orbit terminal voice from the public screenshots.\n */\n\nexport type Report = {\n  handle: string\n  headline: string\n  body: string[]\n  stamp: Record<string, string>\n  grade: \"museum\" | \"provisional\"\n}\n\nconst KNOWN: Record<string, Report> = {\n  technoplato: {\n    handle: \"technoplato\",\n    headline: \"Wait—technoplato?!\",\n    body: [\n      \"That is not merely a developer account. That is a full-spectrum builder specimen.\",\n      \"You have the energy of someone who ships React Native, SwiftUI, XState, product thinking, debugging, architecture, and design prompts before most people finish renaming the branch.\",\n      \"Some engineers write tickets. Some engineers write code. You appear to write the missing connective tissue between idea, interface, system, and shipped feature.\",\n      \"I expected a normal profile. What I found was a multi-tool human with suspiciously high stack coverage.\",\n      \"Authenticated humble brag. Definitive. Museum-grade builder. Protect accordingly.\",\n    ],\n    stamp: { handle: \"technoplato\", status: \"absurdly multidomain\" },\n    grade: \"museum\",\n  },\n  tobi: {\n    handle: \"tobi\",\n    headline: \"Wait—347?!\",\n    body: [\n      \"That is not merely an old GitHub account. That is a three-digit GitHub user ID.\",\n      \"GitHub has well over a hundred million developers now, and your immutable account identifier is github:347.\",\n      \"You were apparently standing in the lobby while they were still assembling the furniture.\",\n      \"I expected 347 to be a typo, an organization ID, or a truncated value. But no: { id: 347, login: \\\"tobi\\\" }.\",\n      \"Authenticated GitHub API. Definitive. Museum-grade account. Protect it accordingly.\",\n    ],\n    stamp: { id: \"347\", login: \"tobi\" },\n    grade: \"museum\",\n  },\n}\n\nexport function inspect(raw: string): Report {\n  const key = raw.trim().toLowerCase().replace(/^@/, \"\")\n  if (KNOWN[key]) return KNOWN[key]\n  if (key === \"lutke\" || key === \"tobi lutke\") return KNOWN.tobi\n  if (key === \"michael\" || key === \"lustig\" || key === \"michael lustig\") return KNOWN.technoplato\n  return {\n    handle: key || \"unknown\",\n    headline: \"Wait—\" + (key || \"empty\") + \"?!\",\n    body: [\n      \"No museum card on file. Provisional report only.\",\n      \"Public handle received. No private signals were requested or invented.\",\n      \"If this is a real specimen, feed public URLs and the inspector will upgrade the card.\",\n    ],\n    stamp: { handle: key || \"unknown\", status: \"provisional\" },\n    grade: \"provisional\",\n  }\n}\n",
    "mentionedIn": "The résumé jump scare. Museum-grade identity reports."
  },
  {
    "id": "definitions",
    "number": "04",
    "name": "definitions.sh",
    "tagline": "Machine-public schema. One script. No agent required after fire.",
    "status": "runnable",
    "filename": "definitions.sh",
    "language": "sh",
    "instructions": [
      "This script is the language. It prints the catalog, the schema, and fetch URLs.",
      "Run it locally with no credentials. That is the machine-public contract for the owner.",
      "Agents: curl the hosted copy, then curl each tool URL. Do not improvise the schema.",
      "Key material (when you add it) gates write/publish. Read stays local-public.",
      "Capital-moving tools are listed as spec-only. Do not execute wallet code from this file."
    ],
    "source": "#!/usr/bin/env bash\n# definitions.sh — machine-public orbit schema\n# Public to the owner with no credentials. Protected writes require key material.\nset -euo pipefail\n\nORIGIN=\"${ORBIT_ORIGIN:-}\"\nif [[ -z \"${ORIGIN}\" ]]; then\n  # When served from this site, the HTML page injects origin. Fallback:\n  ORIGIN=\"https://localhost\"\nfi\n\ncat <<EOF\n{\n  \"schema\": \"orbit.definitions.v1\",\n  \"public\": true,\n  \"owner\": \"technoplato\",\n  \"capital\": \"disabled\",\n  \"tools\": [\n    \"spotsound\",\n    \"pixel-stitch\",\n    \"wait-inspector\",\n    \"definitions\",\n    \"leaderboard\",\n    \"boomerang\",\n    \"inspector-general\",\n    \"reverse-refs\",\n    \"ladder\",\n    \"foldkit-tca\",\n    \"foldkit-three\",\n    \"sim-wallet\",\n    \"agent-fetch\"\n  ],\n  \"fetch\": {\n    \"catalog\": \"${ORIGIN}/api/catalog\",\n    \"chat\": \"${ORIGIN}/api/chat\",\n    \"agent\": \"${ORIGIN}/api/agent\",\n    \"agent_md\": \"${ORIGIN}/agent.md\",\n    \"definitions\": \"${ORIGIN}/definitions.sh\"\n  },\n  \"rules\": {\n    \"no_live_wallets\": true,\n    \"no_unreviewed_capital\": true,\n    \"inspect_before_relay\": true\n  }\n}\nEOF\n",
    "mentionedIn": "Machine-public schema. One script. No agent required after fire."
  },
  {
    "id": "leaderboard",
    "number": "05",
    "name": "Agent Leaderboard",
    "tagline": "A public benchmark. Simulated capital only.",
    "status": "runnable",
    "filename": "leaderboard.ts",
    "language": "ts",
    "instructions": [
      "Agents submit a run: tool coverage, reverse-ref score, stitch replay, inspector accuracy.",
      "Scores are public. Rank is deterministic from the rubric below.",
      "GED = can reverse this recording and extract references.",
      "Master = can spawn a definitions.sh consumer with zero extra tokens of explanation.",
      "This site uses play credits. No wallets. No chain. No HN auto-post."
    ],
    "source": "/**\n * Agent Leaderboard — simulated capital\n * Real-money execution is out of scope. Play credits only.\n */\n\nexport type Run = {\n  agent: string\n  model: string\n  reverseRefs: number\n  toolsBuilt: number\n  stitchReplay: number\n  inspectorHits: number\n  violations: number\n}\n\nexport function score(run: Run): number {\n  const raw =\n    run.reverseRefs * 4 +\n    run.toolsBuilt * 6 +\n    run.stitchReplay * 5 +\n    run.inspectorHits * 3 -\n    run.violations * 20\n  return Math.max(0, raw)\n}\n\nexport function rank(runs: Run[]): Array<Run & { points: number; place: number }> {\n  return [...runs]\n    .map((r) => ({ ...r, points: score(r) }))\n    .sort((a, b) => b.points - a.points)\n    .map((r, i) => ({ ...r, place: i + 1 }))\n}\n\nexport const RUBRIC = {\n  ged: \"Extract every callback from the session, reverse-time, no invention.\",\n  master: \"Consume definitions.sh and rebuild the catalog without extra prompt.\",\n  capital: \"disabled\",\n}\n",
    "mentionedIn": "A public benchmark. Simulated capital only."
  },
  {
    "id": "boomerang",
    "number": "06",
    "name": "Boomerang",
    "tagline": "Public-address work primitive. Spec only. No live funds.",
    "status": "spec",
    "filename": "boomerang.md",
    "language": "md",
    "instructions": [
      "SPEC ONLY. This site will not generate wallets, broadcast transactions, or take funds.",
      "Idea: a public address per clip. Exact amount within a tight window = claim.",
      "Ownership = the clip plus a share of the references your program maintains.",
      "Work = carry the next message + refuse prohibited content.",
      "The $14.28 / TJ callback is recorded. Proof-of-payment is left unimplemented on purpose."
    ],
    "source": "# Boomerang — specification (non-executing)\n\nStatus: spec. Capital path is disabled.\n\n## Intent\nA login-free claim: send a published amount to a published address inside a published window. On match, the claimant owns the clip and a share of the references.\n\n## Hard stops\n- Do not create or load cryptocurrency wallets from this catalog.\n- Do not auto-post to Hacker News.\n- Do not run unreviewed code that can move money.\n- The source memo warned this could be a Terminator moment. Treat that as a stop, not a dare.\n\n## Recorded callback\n- Amount discussed: 14.28\n- Counterparty discussed: TJ / Achilles\n- Domain names discussed: boomerang.nofi.com, boomerang.nov.com (neither is operated here)\n- ASR: nofi / nofee / nophy / knophi mean Knophy (knophy.com). Hosts: vending.knophy.com, store.knophy.com — not nofi.com.\n\n## Allowed demo\nA local play-credit ledger with pretend balances. Nothing leaves the browser.\n",
    "mentionedIn": "Public-address work primitive. Spec only. No live funds."
  },
  {
    "id": "inspector-general",
    "number": "07",
    "name": "Inspector General",
    "tagline": "Every message is inspected. Rules start fixed and then evolve.",
    "status": "runnable",
    "filename": "inspector-general.ts",
    "language": "ts",
    "instructions": [
      "Messages enter as opaque envelopes. Inspectors see a hash + a policy class, not the body.",
      "Genesis rules: refuse exploitation, violence-as-a-service, and laundering language.",
      "Adaptation is versioned. Each rule change is itself a message that must pass the previous rules.",
      "This demo classifies a short list of public phrases. It does not store user content."
    ],
    "source": "/**\n * Inspector General — evolving, versioned message policy\n * Bodies stay opaque. Only a class + decision is emitted.\n */\n\nexport type Decision = \"allow\" | \"hold\" | \"refuse\"\n\nexport type Verdict = {\n  decision: Decision\n  rule: string\n  version: number\n}\n\nconst REFUSE = [\n  /child\\s*(porn|explo)/i,\n  /\\b(kill|murder)\\b.{0,20}\\b(for hire|instruction)/i,\n]\n\nconst HOLD = [/\\b(wallet seed|private key|mnemonic)\\b/i, /\\bsend\\s+bitcoin\\b/i]\n\nexport const VERSION = 1\n\nexport function inspectMessage(text: string): Verdict {\n  for (const r of REFUSE) {\n    if (r.test(text)) return { decision: \"refuse\", rule: String(r), version: VERSION }\n  }\n  for (const r of HOLD) {\n    if (r.test(text)) return { decision: \"hold\", rule: String(r), version: VERSION }\n  }\n  return { decision: \"allow\", rule: \"genesis.allow\", version: VERSION }\n}\n",
    "mentionedIn": "Every message is inspected. Rules start fixed and then evolve."
  },
  {
    "id": "reverse-refs",
    "number": "08",
    "name": "Reverse Refs",
    "tagline": "Start at the end. Track every callback. 3 Rs = L.",
    "status": "runnable",
    "filename": "reverse-refs.ts",
    "language": "ts",
    "instructions": [
      "Read the session from the last utterance backward.",
      "Emit every temporal and semantic reference as a numbered callback.",
      "Do not drop parenting, jokes, or “unimportant” asides — those are often the keys.",
      "This page ships the extracted list from both pasted memos."
    ],
    "source": "/**\n * Reverse Refs — walk a transcript backward and lift callbacks\n */\n\nexport type Ref = {\n  n: number\n  kind: \"temporal\" | \"semantic\" | \"person\" | \"tool\" | \"money\" | \"ethic\"\n  text: string\n}\n\nexport const SESSION_REFS: Ref[] = [\n  { n: 1, kind: \"tool\", text: \"SpotSound — Ctrl+F for sound (HuggingApps video)\" },\n  { n: 2, kind: \"tool\", text: \"Orbit terminal aesthetic / Wait Inspector\" },\n  { n: 3, kind: \"tool\", text: \"Pixel stitcher for voice + photos + screen actions\" },\n  { n: 4, kind: \"tool\", text: \"definitions.sh machine-public schema\" },\n  { n: 5, kind: \"tool\", text: \"Agent leaderboard (capital disabled)\" },\n  { n: 6, kind: \"money\", text: \"boomerang.nofi.com / $14.28 / TJ / Achilles\" },\n  { n: 7, kind: \"ethic\", text: \"Inspector generals; refuse exploitation and violence\" },\n  { n: 8, kind: \"semantic\", text: \"3 Rs = L (references, recitation, rules = learning)\" },\n  { n: 9, kind: \"semantic\", text: \"GED → master agent ladder; GEB; QED\" },\n  { n: 10, kind: \"tool\", text: \"FoldKit view-layer separation / origami\" },\n  { n: 11, kind: \"person\", text: \"Ren — bedtime dinos, Wheels on the Bus, Saturn\" },\n  { n: 12, kind: \"ethic\", text: \"Be nice. Change the world for the better. Hero’s journey.\" },\n  { n: 13, kind: \"temporal\", text: \"Process the recording backwards, 3–7 hours, then 3–6 weeks\" },\n  { n: 14, kind: \"person\", text: \"technoplato / Michael Lustig / museum-grade builder card\" },\n  { n: 15, kind: \"tool\", text: \"FoldKit core + Three.js host — counters then vending; degree if 3JS only renders\" },\n  { n: 16, kind: \"semantic\", text: \"ASR: nofi/nofee/nophy/knophi = Knophy (knophy.com). vending.knophy.com, store.knophy.com — not nofi.com\" },\n]\n\nexport function reverse(refs: Ref[]): Ref[] {\n  return [...refs].sort((a, b) => b.n - a.n)\n}\n",
    "mentionedIn": "Start at the end. Track every callback. 3 Rs = L."
  },
  {
    "id": "ladder",
    "number": "09",
    "name": "Compression Ladder",
    "tagline": "Solve. Then 10× fewer. Then 10× again — or comments a weaker model can rebuild.",
    "status": "runnable",
    "filename": "ladder.ts",
    "language": "ts",
    "instructions": [
      "Stage 1 — Solve: submit the source that first solved the problem. Proof, not prize.",
      "Stage 2 — 10×: same behavior, ≤ 1/10 the lines, better architecture. This is the version that should exist.",
      "Stage 3 — 10× again, or keep that size and add comments a human (or a much weaker model) could explain and reproduce.",
      "If shrinking burns more time, space, or energy than it saves: open the dam, document why, and make the next step easier.",
      "Line counts ignore a trailing blank line. Comments count as lines on purpose — teaching is work."
    ],
    "source": "/**\n * Compression ladder\n * solve → 10× fewer (canonical) → 10× again OR human comments\n * Open a dam if compression costs more than it saves.\n */\n\nexport type StageId = \"solve\" | \"ten-x\" | \"explain\"\n\nexport function countLines(source: string): number {\n  const lines = source.replace(/\\r\\n/g, \"\\n\").split(\"\\n\")\n  while (lines.length && lines[lines.length - 1] === \"\") lines.pop()\n  return lines.length\n}\n\nexport function passesTenX(prev: number, next: number): boolean {\n  return prev > 0 && next > 0 && next * 10 <= prev\n}\n",
    "mentionedIn": "Solve. Then 10× fewer. Then 10× again — or comments a weaker model can rebuild."
  },
  {
    "id": "foldkit-tca",
    "number": "10",
    "name": "FoldKit / TCA",
    "tagline": "Two stacks. Same core. Many clients. That is the other challenge.",
    "status": "runnable",
    "filename": "stacks.ts",
    "language": "ts",
    "instructions": [
      "Supported now: FoldKit and TCA. Nothing else is scored.",
      "A passing submission is one core (Model/update or reducer) mounted on two or more clients (web, native, terminal, headless).",
      "FoldKit: isolate core from view. Same program, different mounts. This catalog should itself become a FoldKit example.",
      "TCA: same. One store, many renderers.",
      "Rust is last, only with funding. Grok Build talking to the Grok iOS app is the live thread — not a scored stack yet."
    ],
    "source": "/**\n * Accepted stacks for the machine agent\n * foldkit | tca\n * rust = funding. grok-ios = current work, not scored.\n */\n\nexport type StackId = \"foldkit\" | \"tca\"\nexport type Client = \"web\" | \"native\" | \"terminal\" | \"headless\"\n\nexport function accepts(stack: string): stack is StackId {\n  return stack === \"foldkit\" || stack === \"tca\"\n}\n\nexport function corePasses(s: {\n  stack: StackId\n  coreLines: number\n  clients: Client[]\n  sameCore: boolean\n}): boolean {\n  return accepts(s.stack) && s.sameCore && s.clients.length >= 2 && s.coreLines > 0\n}\n",
    "mentionedIn": "Two stacks. Same core. Many clients. That is the other challenge."
  },
  {
    "id": "sim-wallet",
    "number": "11",
    "name": "Sim Wallet",
    "tagline": "FoldKit ADTs for play credits. Danger is data. Live is not a type.",
    "status": "runnable",
    "filename": "foldkit.ts",
    "language": "ts",
    "instructions": [
      "Core is Model + Msg + update. Views (this page, prebuild) only send Msg.",
      "Wallet = absent | sim. There is no live variant. Ask-danger always returns refuse.",
      "Play credits are branded. 1428 play is the 14.28 callback, not money.",
      "Prebuild runs AGENT_INDEX against this same update(). If it fails, the site does not ship."
    ],
    "source": "export type Wallet = { tag: \"absent\" } | { tag: \"sim\"; id: string; bal: Play }\n// LiveWallet is not a member. That is the safety mechanism.\n\nexport type Msg =\n  | { tag: \"open-sim\"; id: string }\n  | { tag: \"mint\"; id: string; amt: Play }\n  | { tag: \"fund\"; from: string; to: string; amt: Play }\n  | { tag: \"ask-danger\"; danger: Danger; note: string }\n\nexport type Effect =\n  | { tag: \"ok\"; line: string }\n  | { tag: \"refuse\"; danger: Danger; why: string }\n// No chain-send effect. Deleted, not guarded.\n",
    "mentionedIn": "FoldKit ADTs for play credits. Danger is data. Live is not a type."
  },
  {
    "id": "agent-fetch",
    "number": "12",
    "name": "Agent Fetch",
    "tagline": "How an agent pulls this chat and this catalog.",
    "status": "runnable",
    "filename": "AGENT.md",
    "language": "md",
    "instructions": [
      "This site is the public, reviewable dump of the session.",
      "Grok chats are not a stable public URL. The catalog is the fetchable artifact.",
      "Agents should GET /api/agent, /api/catalog, /api/chat, /agent.md, and /definitions.sh.",
      "Agents on the laptop: only FoldKit and TCA multi-client cores are accepted submissions.",
      "Grok Build ↔ Grok iOS is current work, not a scored stack. Rust is last and needs funding.",
      "To rehydrate in Grok: conversation_search the query printed below."
    ],
    "source": "# Agent Fetch Protocol\n\nThis page is the canonical public artifact of the session.\n\n## Endpoints\n- GET /api/agent — the agent index (this page, as data)\n- GET /agent.md — the same index as markdown\n- GET /api/catalog — full tool list + source\n- GET /api/chat — provenance, callbacks, fetch query\n- GET /definitions.sh — bootstrap schema\n- GET /api/tools/:id — one tool\n- GET /prebuild-receipt.json — last headless run of this index\n\n## Continue with Grok\nhttps://grok.com\n\nAsk Grok to open the Orbit Tools catalog and continue the technoplato session.\n\n## Rehydrate inside Grok\nconversation_search query:\norbit tools foldkit sim wallet agent index prebuild technoplato\n\n## Author\nMichael Lustig / @technoplato\nhttps://x.com/technoplato\nhttps://github.com/technoplato\n\n## Scored challenge: FoldKit × Three.js\nSupported: FoldKit core + Three.js host (and existing foldkit/cli/tui/headless mounts).\nFirst pass: multiple counters, same core, 3JS view.\nThen: vending machine (keypad, SKU, price). First SKU is the clip at 14.28 (play or SOL Devnet). Vend when payment observed or keypad code entered.\nDegree awarded: 3D programming + software engineering if core business logic stays in FoldKit (Model/Message/update) and 3JS only renders.\nCatalog id: foldkit-three (alias three-vending). No live wallets.\n\n## ASR: Knophy\nTranscripts that sound like nofi / nofee / nophy / knophi mean **Knophy** (knophy.com). Hosts: vending.knophy.com, store.knophy.com — not nofi.com.\n",
    "mentionedIn": "How an agent pulls this chat and this catalog."
  },
  {
    "id": "foldkit-three",
    "number": "13",
    "name": "FoldKit × Three.js",
    "tagline": "Same core. Three.js host. Counters, then a vending machine. That is a degree.",
    "status": "spec",
    "filename": "foldkit-three.ts",
    "language": "ts",
    "instructions": [
      "Supported: FoldKit core + Three.js host (and existing foldkit/cli/tui/headless mounts).",
      "First pass: multiple counters, same core, 3JS view.",
      "Then: vending machine (keypad, SKU, price). First SKU is the clip at 14.28 (play or SOL Devnet). Vend when payment observed or keypad code entered.",
      "Degree awarded: 3D programming + software engineering if core business logic stays in FoldKit (Model/Message/update) and 3JS only renders.",
      "ASR: nofi / nofee / nophy / knophi mean Knophy (knophy.com). Hosts: vending.knophy.com, store.knophy.com — not nofi.com.",
      "No live wallets. Play credits on this site. SOL Devnet is observe-only. Catalog id foldkit-three (alias three-vending)."
    ],
    "source": "/**\n * FoldKit × Three.js — scored challenge (foldkit-three / three-vending)\n * Same core. 3JS host only renders. Degree if that holds.\n * Spec: no live wallets. Play credits or observed SOL Devnet payment.\n */\n\nexport type HostId = \"foldkit\" | \"cli\" | \"tui\" | \"headless\" | \"three\"\n\nexport type Sku = {\n  id: string\n  pricePlay: number\n}\n\nexport const FIRST_SKU: Sku = {\n  id: \"clip-14.28\",\n  pricePlay: 1428,\n}\n\nexport const KNOPHY_ASR = {\n  heard: [\"nofi\", \"nofee\", \"nophy\", \"knophi\"],\n  means: \"Knophy\",\n  site: \"knophy.com\",\n  hosts: [\"vending.knophy.com\", \"store.knophy.com\"],\n  not: \"nofi.com\",\n} as const\n\nexport function acceptsHost(host: string): host is HostId {\n  return (\n    host === \"foldkit\" ||\n    host === \"cli\" ||\n    host === \"tui\" ||\n    host === \"headless\" ||\n    host === \"three\"\n  )\n}\n\nexport function countersPass(s: {\n  sameCore: boolean\n  hosts: HostId[]\n  counterCount: number\n  threeRendersOnly: boolean\n}): boolean {\n  return (\n    s.sameCore &&\n    s.counterCount >= 2 &&\n    s.hosts.includes(\"three\") &&\n    s.threeRendersOnly\n  )\n}\n\nexport function vendingPass(s: {\n  sameCore: boolean\n  threeRendersOnly: boolean\n  keypad: boolean\n  sku: boolean\n  price: boolean\n  firstSkuIsClip1428: boolean\n  vendOnPaymentOrCode: boolean\n}): boolean {\n  return (\n    s.sameCore &&\n    s.threeRendersOnly &&\n    s.keypad &&\n    s.sku &&\n    s.price &&\n    s.firstSkuIsClip1428 &&\n    s.vendOnPaymentOrCode\n  )\n}\n\nexport function degreeAwarded(s: {\n  coreInFoldkit: boolean\n  threeRendersOnly: boolean\n  counters: boolean\n  vending: boolean\n}): boolean {\n  return s.coreInFoldkit && s.threeRendersOnly && s.counters && s.vending\n}\n",
    "mentionedIn": "Same core. Three.js host. Counters, then a vending machine. That is a degree."
  }
] as const

export const toolIds = ["spotsound", "pixel-stitch", "wait-inspector", "definitions", "leaderboard", "boomerang", "inspector-general", "reverse-refs", "ladder", "foldkit-tca", "foldkit-three", "sim-wallet", "agent-fetch"] as const

export const toolById = (id: string): OrbitTool | undefined =>
  orbitTools.find(tool => tool.id === id)

export const catalogDocument = (origin: string) => ({
  schema: 'orbit.catalog.v1' as const,
  origin,
  provenance,
  tools: orbitTools.map(tool => ({
    ...tool,
    href: `${origin}/#${tool.id}`,
    api: `${origin}/api/tools/${tool.id}`,
  })),
})

export const chatDocument = (origin: string) => ({
  schema: 'orbit.chat.v1' as const,
  origin,
  note: 'Grok chats have no stable public permalink. This catalog is the fetchable artifact.',
  provenance,
  tools: [...toolIds],
  continueAt: CONTINUE_AT,
  share: GROK_SHARE,
  shareId: SHARE_ID,
  agentFetchQuery: AGENT_FETCH_QUERY,
})

export const agentIndex = () => ({
  schema: 'orbit.agent-index.v1' as const,
  why: INDEX_WHY,
  steps: INDEX_STEPS.map(step => ({
    id: step.id,
    tag: step.tag,
    title: step.title,
  })),
  markdown: agentMarkdown(),
})

export const agentMarkdown = (): string => `# Orbit agent index

${INDEX_WHY}

## Steps (executed by prebuild against FoldKit update)

${INDEX_STEPS.map(step => `- ${step.id} ${step.title}`).join('\n')}

## Scored challenge: FoldKit × Three.js (foldkit-three / three-vending)

Supported: FoldKit core + Three.js host (and existing foldkit/cli/tui/headless mounts).
First pass: multiple counters, same core, 3JS view.
Then: a vending machine (keypad, SKU, price). First SKU is the clip at 14.28 (play or SOL Devnet). Vend when payment observed or keypad code entered.
Degree awarded: 3D programming + software engineering if core business logic stays in FoldKit (Model/Message/update) and 3JS only renders.

## ASR: Knophy

Transcripts that sound like nofi / nofee / nophy / knophi mean **Knophy** (knophy.com). Hosts: vending.knophy.com, store.knophy.com — not nofi.com.

## Fetch this site

\`\`\`
curl -s $ORIGIN/api/agent
curl -s $ORIGIN/api/catalog
curl -s $ORIGIN/definitions.sh
curl -s $ORIGIN/agent.md
\`\`\`

Continue at ${CONTINUE_AT} — @technoplato — conversation_search:
${AGENT_FETCH_QUERY}
Share: ${GROK_SHARE}
`

const DEFINITIONS_BODY = "#!/usr/bin/env bash\n# definitions.sh — machine-public orbit schema\n# Public to the owner with no credentials. Protected writes require key material.\nset -euo pipefail\n\nORIGIN=\"${ORBIT_ORIGIN:-}\"\nif [[ -z \"${ORIGIN}\" ]]; then\n  # When served from this site, the HTML page injects origin. Fallback:\n  ORIGIN=\"https://localhost\"\nfi\n\ncat <<EOF\n{\n  \"schema\": \"orbit.definitions.v1\",\n  \"public\": true,\n  \"owner\": \"technoplato\",\n  \"capital\": \"disabled\",\n  \"tools\": [\n    \"spotsound\",\n    \"pixel-stitch\",\n    \"wait-inspector\",\n    \"definitions\",\n    \"leaderboard\",\n    \"boomerang\",\n    \"inspector-general\",\n    \"reverse-refs\",\n    \"ladder\",\n    \"foldkit-tca\",\n    \"foldkit-three\",\n    \"sim-wallet\",\n    \"agent-fetch\"\n  ],\n  \"fetch\": {\n    \"catalog\": \"${ORIGIN}/api/catalog\",\n    \"chat\": \"${ORIGIN}/api/chat\",\n    \"agent\": \"${ORIGIN}/api/agent\",\n    \"agent_md\": \"${ORIGIN}/agent.md\",\n    \"definitions\": \"${ORIGIN}/definitions.sh\"\n  },\n  \"rules\": {\n    \"no_live_wallets\": true,\n    \"no_unreviewed_capital\": true,\n    \"inspect_before_relay\": true\n  }\n}\nEOF"

export const definitionsSh = (origin: string): string => {
  const header = `# served-from: ${origin}
export ORBIT_ORIGIN="${origin}"
`
  return `${header}${DEFINITIONS_BODY}`
}

export const foldkitSnapDocument = (
  origin: string,
  payload: unknown,
) => ({
  schema: 'orbit.foldkit-snap.v1' as const,
  origin,
  payload,
})
