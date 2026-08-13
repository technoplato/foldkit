# Vending

Foldkit core owns vend rules as tagged unions (`Selection`, `VendPhase`,
`WalletPhase`). Do not flatten those phases into booleans. The same
`asyncData` / `ts` style applies. World nests this Program while Operating.
Three.js only renders. This is the degree:
3D programming plus software engineering. The same VendingProgram drives
the HTML keypad, the 3JS machine, and the headless watcher.

Knophy, not nofi.

## Price

The machine face lists the clip at 14.28 play / $14.28 (TJ/tortoise clip).
Devnet settlement is 0.001 SOL (1_000_000 lamports) so a wallet test can
actually vend. Both values live on the Model:

- listPriceDisplay: "14.28"
- settleLamports: 1_000_000n

Do not send mainnet funds.

## SKU

Code 1428. Dial it, press Enter, pay the Devnet receive address. Confirmed
incoming at or above the settle threshold dispenses. Wrong code is WrongCode.
Below-threshold payment stays AwaitingPayment.

## Hosts

- vending-core-example: Program, ADTs, tests
- vending-three-example: public 3JS machine at vending.knophy.com
- vending-foldkit-example: HTML keypad plus QR
- vending-headless-example: print SOL address JSON, watch until vend or timeout

Hosted preview: https://vending.knophy.com

From the FoldKit repo root, test and build vending-core-example, then build
and preview vending-three-example on 127.0.0.1:5205. Foldkit HTML is
vending-foldkit-example. Headless prints the public SOL receive address and
never prints keys.

Three.js does not live in update(). The Three.js host builds a physical
cabinet, glass, keypad, LED, and door from a dimension contract. PBR
materials, ACES tone mapping, bounded shadows, and LED bloom stay in the
host. Door and clip motion run in the host frame loop from vendPhase.

Debug views: `?view=final`, `?view=no-post`, `?view=topology`,
`?view=bloom`, `?view=materials`. The no-post view must still read as a
machine.

## Counters-three

examples/counters/three remounts the existing MultipleCountersProgram on
Three.js. That is the adapter proof: core owns counts, the host owns camera
and the frame loop. Build counters-core-example, then run
counters-three-example. Preview binds 127.0.0.1:5208.
