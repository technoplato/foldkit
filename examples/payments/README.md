# Payments

View-agnostic Foldkit merchant rails. One Program owns checkout. Clients only
paint and dispatch.

Each rail is a core module: x402 exact USDC on Base, Stripe Checkout, Polar,
Lemon Squeezy, PayPal, Coinbase Onramp, Stripe x402 deposit, Stripe Payment
Element, and Apple Pay. Secrets never enter the Model or Messages. Adapters
hold keys and provide the `PaymentProcessor` Layer.

Card rails quote at a 50 cent floor. x402 stays exact. Coinbase Onramp buys
USDC, then the Program still settles the 402.

## Clients

- `payments-core-example` renderer-free Program
- `payments-cli-example` `show` and `do`
- `payments-foldkit-example` Foldkit HTML
- `payments-react-example` React adapter
- `payments-headless-example` Processor with no view

## Run

From the Foldkit repo root:

```bash
pnpm --filter payments-core-example test
pnpm --filter payments-cli-example build && pnpm --filter payments-cli-example payments show
pnpm --filter payments-cli-example payments do select stripe-checkout
pnpm --filter payments-foldkit-example dev
pnpm --filter payments-react-example dev
```

No live provider keys live in this repo. The default Layer is inert.
