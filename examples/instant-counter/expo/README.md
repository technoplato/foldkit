# Foldkit | Instant Counter Expo Dev Client

This package is a real Expo SDK 57 and React Native 0.86 Dev Client host for the authenticated Instant Counter. It does not fork the Counter Program. The native UI proposes only the canonical `ClickedIncrement`, `ClickedDecrement`, and `ClickedReset` Messages, then renders snapshots from the shared accepted tape.

## Public configuration

Load the persistent demo application's configuration through the `foldkit-instant-demo` credential wrapper, then start the package script:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --filter instant-counter-expo-example dev-client
```

The credential wrapper provides the shared app configuration without copying or sourcing credentials manually. Every Metro, native build, and export script then runs through `../scripts/with-public-instant-env`. That second wrapper removes `INSTANT_APP_ADMIN_TOKEN` and `INSTANT_CLI_AUTH_TOKEN` before Expo starts. Only `EXPO_PUBLIC_INSTANT_APP_ID` reaches Metro. The native bundle must never receive either privileged token.

The app uses email magic-code authentication only. Instant retains its own native authentication material. Email codes, refresh tokens, raw auth errors, and executable closures never enter the Foldkit Model, Message tape, controller view state, or notices.

## Dev Client workflow

Install native dependencies through the workspace, then create a development build:

```sh
pnpm --filter instant-counter-expo-example run:ios
pnpm --filter instant-counter-expo-example run:android
```

After the development build is installed, start Metro with:

```sh
pnpm --filter instant-counter-expo-example dev-client
```

`start` is also configured for the Dev Client. This host is intentionally documented as a Dev Client rather than an Expo Go acceptance surface.

Static native bundles can be checked with:

```sh
pnpm --filter instant-counter-expo-example export:ios
pnpm --filter instant-counter-expo-example export:android
```

## Native wrapper and shared authority

`@instantdb/react-native` owns authentication, native persistence, network observation, and the React hooks. It is initialized with the complete schema from `instant-counter-example/schema`. The shared Processor receives `nativeDatabase.core`, not the React wrapper, through `instant-counter-example/processor-client`.

AsyncStorage retains stable non-secret Client and device identifiers plus serialized per-session actor sequences. Corrupt records are removed and regenerated without rendering their contents. Expo Crypto supplies lowercase SHA-256 session derivation and UUID creation.

The native Descriptor advertises no effect capabilities and `isEffectExecutor: false`. Its EffectExecutor also fails every unexpected invocation with one fixed unsupported reason. The accepted Instant authority remains the only source of truth for count and accepted sequence.

On sign-out the controller fences actions, aborts startup, publishes effect-executor unavailability, disconnects, detaches snapshot observation, closes the allocation Scope, and only then calls the React Native wrapper's `auth.signOut()`.

## Reproducible build provenance

The app logs `EXPO_PUBLIC_BUILD_PROVENANCE` at startup when a clean reproducible build embeds it. A missing value is explicitly logged as unavailable for a development build. Generate and supply that value from the repository change-log build provenance workflow when producing a distributable build.

## Verification boundary

Run deterministic controller and storage checks with:

```sh
pnpm --filter instant-counter-expo-example test
pnpm --filter instant-counter-expo-example typecheck
```

These checks cover local identity, actor sequence concurrency and recovery, proposal mapping, snapshot observation, cancellation, sign-out ordering, reconnect ordering, subject replacement, and sanitized failures. They are source-level and simulator-independent. This package makes no claim that iOS or Android was physically installed, launched, signed in, or visually accepted on a device.
