# Dual Camera (view-agnostic)

View both front and back cameras at once ("what I'm looking at" + "me").

## Platform reality (Apple focus)

| Platform                                                        | Concurrent front+back                 |
| --------------------------------------------------------------- | ------------------------------------- |
| iOS / iPadOS native (AVCaptureMultiCamSession)                  | Yes (A12+)                            |
| Expo / React Native via custom native module or VisionCamera V5 | Yes (dev build)                       |
| Safari / WebKit getUserMedia                                    | **No** — second camera ends the first |
| expo-camera                                                     | No — one active preview only          |
| Android Chrome getUserMedia                                     | Yes                                   |

## FoldKit shape

One Program. Pure `update`. Platform adapters own the camera session.

- Model: support, permission, running, layout (pip | sideBySide), hardwareCost, error
- Messages: checkSupport, requestPermission, start, stop, setLayout, ...
- Hosts: ios (native), expo, web (fallback), cli (status only)

Branch target: `ml/exploring-view-agnosticism`
Mirrors: `examples/counter`
