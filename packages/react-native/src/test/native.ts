/**
 * React Native's parts as plain names, so a test reads the tree a painter
 * returns without a device: `View` is the string `'View'`.
 */
export const native = {
  AccessibilityInfo: {},
  Appearance: {},
  Image: 'Image',
  Linking: { openURL: (): Promise<void> => Promise.resolve() },
  Modal: 'Modal',
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: {
    OS: 'ios',
    select: (choices: Readonly<{ ios?: unknown; default?: unknown }>) =>
      choices.ios ?? choices.default,
  },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}

/** `react-native-svg`'s parts as plain names. */
export const svg = { Path: 'Path', Svg: 'Svg', Text: 'SvgText' }
