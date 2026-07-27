# React Native Showcase

This Expo application runs a showcase navigation Program plus the canonical Counter,
Multiple Counters, Calculator, and Fact Programs through shared React bindings. The
same source runs on Expo Web, iOS, and Android. No Program imports React Native,
browser APIs, or Expo.

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

## Navigation

The initial Model presents `HomeScene`. Tapping an example sends a factual Message,
such as `TappedCounterButton`, through the showcase update loop. Update selects the
next navigation union case, and the host renders the corresponding child Program.

The navigation Program has its own replay tape. Inspecting frame zero after tapping
Counter returns to the landing scene without executing host effects. Sending another
scene action while inspecting branches navigation live from that frame.

`/showcase`, `/showcase/counter`, `/showcase/counters`, `/showcase/calculator`, and
`/showcase/fact` are canonical relative scene paths. Expo Web projects Model changes
to browser history. Expo native observes incoming Linking URLs. Both carriers parse
opened destinations and send `OpenedNavigation` back through update. Child Program
state and replay paths remain valid and select their containing scene after parsing.

Multiple Counters also projects its canonical child destinations as `/counters`,
`/counters/:counterId`, `/counters/:counterId/fact`, and
`/counters/:counterId/delete`. The Expo client renders the same exhaustive
destination projection as the other clients. Opening a row enters the counter detail,
and confirming deletion removes that identified Counter Submodel through the shared
update function. The native carrier removes Expo Go's `/--/` launch delimiter before
passing the relative path to the Program parser. `/showcase/counters` is accepted as a
scene alias and normalized to the current canonical `/counters` child destination.

## Replay

Each screen reads its Model and actions from domain-shaped hooks. Its replay panel
comes from the same client-specific `useReplay` hook. The showcase shell uses the
same contract for navigation. Inspecting or stepping through history is inert.
Sending a domain action while inspecting a settled frame branches live from that
frame.

The panels have explicit scopes. `Showcase replay` contains scene-selection Messages.
`Multiple Counters replay` contains only the child Program's portable Messages. The
separate tapes allow a Multiple Counters recording to run in React, Expo, CLI, or TUI
without requiring the Showcase Program.

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
