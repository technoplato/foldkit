/** First-beat DEATH submit screen. Bundle, fee, and stake only. */
export const SUBMIT_ASCII = `
┌ DEATH  ·  submit  ·  beat 1 of 1 🐱🐭🐰🧀 ─────────────────────────────────┐
│  You are looking at what she is about to send. The hospital has not      │
│  started anything. The box is empty. Nobody is scoring yet.              │
│                                                                          │
│ ┌ SUBMITTER ─────────────────────────────┐ ┌ BOX ──────────────────────┐ │
│ │ What she is sending                    │ │                           │ │
│ │                                        │ │  empty                    │ │
│ │  bundle.tgz                            │ │                           │ │
│ │  ├── start          script the         │ │  There is no process.     │ │
│ │  │                  hospital will run  │ │  No stdin. No stdout.     │ │
│ │  ├── src/           program            │ │  The hospital does not    │ │
│ │  └── package.json   deps               │ │  start a surface until    │ │
│ │                                        │ │  a paid bundle exists.    │ │
│ │  The bundle decides which devices and  │ ├ EVALUATOR ────────────────┤ │
│ │  frameworks it can start. She does     │ │                           │ │
│ │  not list those on this form.          │ │  waiting                  │ │
│ │                                        │ │                           │ │
│ │  submission fee   40.00 USD            │ │  Nothing to admit or      │ │
│ │    Pays the hospital to run this       │ │  reject yet. Scoring      │ │
│ │    attempt. No fee means this is       │ │  starts after a paid      │ │
│ │    not a submission.                   │ │  bundle is in the         │ │
│ │                                        │ │  hospital. Lock-ins are   │ │
│ │  stake            10.00 USD            │ │  proven later, while it   │ │
│ │    Second payment. If she loses, this  │ │  runs, not on this form.  │ │
│ │    goes to the treasury, not to her.   │ │                           │ │
│ │                                        │ │                           │ │
│ │  [ send bundle, fee, and stake ]       │ │                           │ │
│ └────────────────────────────────────────┘ └───────────────────────────┘ │
│                                                                          │
│  does this step look right?                                              │
│  ← → later beats   ↑↓ which panel   paste amends this screen             │
└──────────────────────────────────────────────────────────────────────────┘
`.trim()
