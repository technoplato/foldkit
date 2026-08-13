# World

One renderer-free World Program. Many clients.

The Model is a tagged union. The player is roaming, reading a sign, or
operating the nested Vending Program. Those states cannot overlap.

- Roaming: arrows, W, S, D walk. Q or Left walks west.
- Press A or Space: talk when you face a sign or the machine.
- Esc or A: dismiss a sign overlay.
- Operating: keypad digits go to VendingProgram (SKU 1428, listed 14.28).

Core never renders. Three.js, Foldkit HTML, React, OpenTUI, and headless
all run the same update.

No mainnet. No keys.

## Run

From the Foldkit repo root:

1. Build `world-core-example`.
2. Preview `world-three-example` on `127.0.0.1:5207`.

Hosted preview: https://world.knophy.com
