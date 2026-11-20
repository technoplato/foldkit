---
'foldkit': minor
'@foldkit/react-native': minor
---

Add `foldkit/code-updates` (`CodeUpdates` from `foldkit`): a Program can know which code its Client runs and when newer code is ready. The host says a `CodeStatus` through the `CodeUpdates` service, such as `{ running: Update({ maybeUpdateId: Some('1a2b3c4d-…'), … }), newer: Ready({ maybeUpdateId: Some('9f8e7d6c-…') }) }`; the Program hears it as `ObservedCodeStatus`, restarts with the `RestartToUpdate` Action, and shows it with `sectionOf`, which is empty where the host says nothing. A host that supplies no service says nothing, and `noCodeUpdates` names that on purpose.

Add `@foldkit/react-native/updates`: `expoCodeUpdates(Updates)` supplies that service from Expo's `expo-updates` module, passed in as an argument. `runningCodeOfExpo` and `newerCodeOfExpo` are the one reading of Expo's state. The trace notes `runningCodeOf`, `updatesOutcomeOf`, and `watchUpdates` are now derived from them; the types `RunningCode` and `UpdatesCheck` in `@foldkit/react-native/telemetry` are replaced by `ExpoRunningCode` and `ExpoUpdatesCheck` in `@foldkit/react-native/updates`, and newer code that is found and not yet fetched is no longer noted as `none newer`.
