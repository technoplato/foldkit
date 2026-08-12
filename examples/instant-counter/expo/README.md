# Foldkit | Instant Multiple Counters Expo Dev Client

This package is a real Expo SDK 57 and React Native 0.86 Dev Client host for authenticated Instant Multiple Counters. It does not fork the Program. The native UI proposes the same interaction-graph tokens as Foldkit, React, CLI, and TUI, then renders snapshots from the shared accepted tape. Independent, Mirror, and Follow are Instant session policy, not Program Model fields.

## Public configuration

Load the persistent demo application's configuration through the `foldkit-instant-demo` credential wrapper, then start the package script:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --filter instant-counter-expo-example dev-client
```

The credential wrapper provides the shared app configuration without copying or sourcing credentials manually. Every Metro, native build, and export script then runs through `../scripts/with-public-instant-env`. That second wrapper removes `INSTANT_APP_ADMIN_TOKEN` and `INSTANT_CLI_AUTH_TOKEN` before Expo starts. Only `EXPO_PUBLIC_INSTANT_APP_ID` and optional `EXPO_PUBLIC_DEBUG_LOGIN_ORIGIN` reach Metro. The native bundle must never receive either privileged token.

In local Dev Client builds, the signed-out screen includes **Sign in as Alice** and **Sign in as Bob**. Those buttons ask the headless process to mint Instant magic codes. They never receive the admin token. iOS Simulator can reach `127.0.0.1:18788`. Android emulator uses `10.0.2.2`. A physical device uses the Metro LAN host and needs the headless mint bound on all interfaces:

```sh
FOLDKIT_INSTANT_DEBUG_LOGIN_HOST=0.0.0.0 \
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter headless
```

Override the mint origin with `EXPO_PUBLIC_DEBUG_LOGIN_ORIGIN` when Metro's host is not the machine running headless. Production builds omit the debug buttons.

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

`@instantdb/react-native` owns authentication, native persistence, network observation, and the React hooks. It is initialized with the complete schema from `instant-counter-example/schema`. The shared v3 Processor receives `nativeDatabase.core`, not the React wrapper.

AsyncStorage retains origin secrets and per-session actor sequences. Corrupt records are removed and regenerated without rendering their contents. Expo Crypto supplies UUID creation and Processor secret bytes.

The native Client requests Independent, Mirror, and Follow through the same controller as the other Instant hosts. Observe followers keep domain actions such as increment and add. They cannot open, leave, or change destinations themselves.

## Reproducible build provenance

The app logs `EXPO_PUBLIC_BUILD_PROVENANCE` at startup when a clean reproducible build embeds it. A missing value is explicitly logged as unavailable for a development build. Generate and supply that value from the repository change-log build provenance workflow when producing a distributable build.

## Verification boundary

Run deterministic identity-vault and debug-login URL checks with:

```sh
pnpm --filter instant-counter-expo-example test
pnpm --filter instant-counter-expo-example typecheck
```

These checks cover AsyncStorage identity recovery, Android emulator host rewriting, and explicit mint-origin overrides. They are source-level and simulator-independent. This package makes no claim that iOS or Android was physically installed, launched, signed in, or visually accepted on a device.
