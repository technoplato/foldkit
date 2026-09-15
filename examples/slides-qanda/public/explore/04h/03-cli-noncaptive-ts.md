# Non-captive names the CLI, not the framework

A start string names a surface: device, then framework, then language.

Non-captive describes how the CLI behaves. It is not a framework slot. After the language you still name the framework, or write `custom`.

This is a surface the hospital can start:

```text
$ death start cli/custom/ts
started  device=cli  framework=custom  language=ts
```

This is not a framework slot. Do not pass it to start:

```text
$ death start cli/noncaptive/ts
```

The hospital must declare which surfaces it supports. Example surfaces: `ios/expo/ts`, `ios/expo/js`, `ios/native/swift`, `ios/react-native/ts`, `cli/custom/ts`.
