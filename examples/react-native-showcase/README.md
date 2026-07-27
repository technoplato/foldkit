# React Native Showcase

This Expo application runs the canonical Counter, Multiple Counters, Calculator, and
Fact Programs through their shared React bindings. The same source runs on Expo Web,
iOS, and Android. No Program imports React Native, browser APIs, or Expo.

## Run

From the repository root:

```text
pnpm dev:example:showcase:web
pnpm dev:example:showcase:ios
pnpm dev:example:showcase:android
pnpm dev:example:showcase:native
```

The `native` command opens Expo's client selector. The other commands request a
specific platform.

## Replay

Each screen reads its Model and actions from domain-shaped hooks. Its replay panel
comes from the same client-specific `useReplay` hook. Inspecting or stepping through
history is inert. Sending a domain action while inspecting a settled frame branches
live from that frame.

`Share state` prints the current Model as the Program's canonical relative state path.
`Share replay` prints the current typed tape and selected frame. The carrier adds the
current HTTP origin on web and `foldkit://showcase` on native platforms. Opening either
carrier parses the same relative path back into the selected Program route.

Saved UUID replay paths need a `ReplayTapeStore` and are intentionally not resolved by
this standalone showcase. Inline state and replay paths work without external storage.

## Dependencies

The Fact screen proves two independently switchable Effect dependencies in one client:

- `FactClient` selects a Mock or Live HTTP Layer.
- `ClientPlatform` selects a Web, iOS, or Android Layer.

The Expo composition root chooses the initial platform implementation. The Program
does not detect its renderer or platform. Successful selections are recorded as
frame-anchored runtime events in the same replay tape and restored before a live branch
acquires its Layers.

## Metro

The local Babel configuration keeps object-rest-spread in spec mode. Expo's default
loose transform flattens a computed getter in Effect's runtime prototype through
`Object.assign`, which corrupts Effect `Exit` values even though the bundle succeeds.
This compatibility setting belongs in a future Foldkit Expo template rather than in
individual application code.
