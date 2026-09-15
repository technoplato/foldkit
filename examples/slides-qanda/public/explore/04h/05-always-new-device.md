# Start always opens a new device

The same surface string twice is two devices. A running copy does not reuse.

```text
$ death start ios/expo/ts
started  device=ios  framework=expo  language=ts  copy=1
```

```text
$ death start ios/expo/ts
started  device=ios  framework=expo  language=ts  copy=2
```

Start does not attach to a device that is already running. Each start line is a new copy.
