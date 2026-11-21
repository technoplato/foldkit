import { Array, Option, Schema as S } from 'effect'

import * as Avatar from '../behavior/avatar.js'
import * as Clipboard from '../behavior/clipboard.js'
import * as Part from '../behavior/part.js'
import * as Progress from '../behavior/progress.js'
import * as QrCode from '../behavior/qrCode.js'
import * as Timer from '../behavior/timer.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import {
  Box,
  Button,
  Column,
  Row,
  Text,
  TextInput,
} from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing all 5 Cluster 5 core Parts (Timer,
// Progress, Avatar, Clipboard, QrCode) once, driven by the HTML, React, and
// React Native generic host tests with zero widget-specific painter code.

export const FixtureModel = S.Struct({
  title: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameCluster5 = Catalog.action('RenameCluster5', {
  fields: { title: S.String },
  what: 'Updates the cluster showcase title',
  why: 'To identify the composed view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameCluster5])

const BaseProgram = make({
  id: 'cluster5-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ title: 'Cluster 5 Parts' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, title: message.title }, []],
  catalog: fixtureCatalog,
})

export const defaultTimerProps: Timer.Props = {
  id: 'fixture-timer',
  countdown: true,
  startMs: 5000,
  targetMs: 0,
  intervalMs: 1000,
  label: 'Session timer',
}

export const defaultProgressProps: Progress.Props = {
  id: 'fixture-progress',
  kind: 'Progress',
  min: 0,
  max: 100,
  hasLabel: true,
}

export const defaultAvatarProps: Avatar.Props = {
  id: 'fixture-avatar',
  name: 'Ada Lovelace',
  src: Option.some('https://example.com/ada.png'),
}

export const defaultClipboardProps: Clipboard.Props = {
  id: 'fixture-clipboard',
  defaultValue: 'https://foldkit.dev/cluster5',
  timeoutMs: 3000,
  hasLabel: true,
}

export const defaultQrCodeProps: QrCode.Props = {
  id: 'fixture-qr',
  label: 'Share QR',
}

export type FixtureProps = Readonly<{
  timer: Timer.Props
  progress: Progress.Props
  avatar: Avatar.Props
  clipboard: Clipboard.Props
  qrCode: QrCode.Props
}>

export type FixtureOverrides = Readonly<{
  timer?: Partial<Timer.Props>
  progress?: Partial<Progress.Props>
  avatar?: Partial<Avatar.Props>
  clipboard?: Partial<Clipboard.Props>
  qrCode?: Partial<QrCode.Props>
}>

const emptySlot = () => ({ gestures: [], maybeHold: Option.none() })

const noTimerView: Part.View<Timer.State> = {
  state: Timer.initial,
  slot: emptySlot,
}

const noProgressView: Part.View<Progress.State> = {
  state: Progress.initial,
  slot: emptySlot,
}

const noAvatarView: Part.View<Avatar.State> = {
  state: Avatar.initial,
  slot: emptySlot,
}

const noClipboardView: Part.View<Clipboard.State> = {
  state: Clipboard.initial,
  slot: emptySlot,
}

const noQrCodeView: Part.View<QrCode.State> = {
  state: QrCode.initial,
  slot: emptySlot,
}

export const cluster5Screen = (
  _model: FixtureModel,
  views: Part.Views,
  props: FixtureProps,
): UiNode => {
  const timer = views['Timer'] ?? noTimerView
  const progress = views['Progress'] ?? noProgressView
  const avatar = views['Avatar'] ?? noAvatarView
  const clipboard = views['Clipboard'] ?? noClipboardView
  const qrCode = views['QrCode'] ?? noQrCodeView

  const timerMs = Timer.currentMsOf(timer.state, props.timer)
  const formattedTimer = Timer.formattedOf(timerMs)

  return Column(
    { gap: 2 },
    // Timer
    Column(
      { gap: 1, slot: timer.slot('Root') },
      Row(
        { gap: 1, slot: timer.slot('Area') },
        Box(
          { padding: 0, slot: timer.slot('Item', 'Minutes') },
          Text(formattedTimer.minutes),
        ),
        Box(
          { padding: 0, slot: timer.slot('Item', 'Seconds') },
          Text(formattedTimer.seconds),
        ),
      ),
      Row(
        { gap: 1, slot: timer.slot('Control') },
        Button({
          label: 'Start timer',
          action: Timer.StartTimer.tag,
          slot: timer.slot('StartTrigger'),
        }),
        Button({
          label: 'Pause timer',
          action: Timer.PauseTimer.tag,
          slot: timer.slot('PauseTrigger'),
        }),
        Button({
          label: 'Resume timer',
          action: Timer.ResumeTimer.tag,
          slot: timer.slot('ResumeTrigger'),
        }),
        Button({
          label: 'Lap timer',
          action: Timer.LapTimer.tag,
          slot: timer.slot('LapTrigger'),
        }),
        Button({
          label: 'Reset timer',
          action: Timer.ResetTimer.tag,
          slot: timer.slot('ResetTrigger'),
        }),
      ),
    ),
    // Progress / Meter
    Column(
      { gap: 1, slot: progress.slot('Root') },
      Box(
        { padding: 0, slot: progress.slot('Label') },
        Text('Upload progress'),
      ),
      Box(
        { padding: 0, slot: progress.slot('Track') },
        Box(
          { padding: 0, slot: progress.slot('Range') },
          Text(Progress.valueTextOf(progress.state, props.progress)),
        ),
      ),
      Box(
        { padding: 0, slot: progress.slot('ValueText') },
        Text(Progress.valueTextOf(progress.state, props.progress)),
      ),
      Row(
        { gap: 1 },
        Button({
          label: 'Set 50%',
          action: Part.pressOf(
            Progress.SetProgressValue.tag,
            Option.some('50'),
          ),
        }),
        Button({
          label: 'Set indeterminate',
          action: Progress.SetProgressIndeterminate.tag,
        }),
        Button({
          label: 'Reset progress',
          action: Progress.ResetProgress.tag,
        }),
      ),
    ),
    // Avatar
    Row(
      { gap: 1, slot: avatar.slot('Root') },
      Box(
        { padding: 0, slot: avatar.slot('Image') },
        Text(
          Option.getOrElse(Avatar.srcOf(avatar.state, props.avatar), () => ''),
        ),
      ),
      Box(
        { padding: 0, slot: avatar.slot('Fallback') },
        Text(Avatar.initialsOf(Avatar.nameOf(avatar.state, props.avatar))),
      ),
      Button({
        label: 'Reset avatar',
        action: Avatar.ResetAvatar.tag,
      }),
    ),
    // Clipboard
    Column(
      { gap: 1, slot: clipboard.slot('Root') },
      Box({ padding: 0, slot: clipboard.slot('Label') }, Text('Share link')),
      Row(
        { gap: 1, slot: clipboard.slot('Control') },
        TextInput({
          value: Clipboard.valueOf(clipboard.state, props.clipboard),
          slot: clipboard.slot('Input'),
        }),
        Button({
          label: 'Copy value',
          action: Clipboard.CopyClipboard.tag,
          disabled: Clipboard.isDisabledOf(props.clipboard),
          slot: clipboard.slot('Trigger'),
        }),
      ),
      Box({ padding: 0, slot: clipboard.slot('Indicator') }, Text('Copied')),
    ),
    // QrCode
    Column(
      { gap: 1, slot: qrCode.slot('Root') },
      Box(
        { padding: 0, slot: qrCode.slot('Frame') },
        Box(
          { padding: 0, slot: qrCode.slot('Pattern') },
          Text(Option.getOrElse(QrCode.svgPathStateOf(qrCode.state), () => '')),
        ),
        Box({ padding: 0, slot: qrCode.slot('Overlay') }, Text('FK')),
      ),
      Row(
        { gap: 1 },
        Button({
          label: 'Download QR',
          action: QrCode.RequestQrCodeDownload.tag,
          disabled: !QrCode.isReady(qrCode.state),
          slot: qrCode.slot('DownloadTrigger'),
        }),
        Button({
          label: 'Clear QR',
          action: QrCode.ClearQrCode.tag,
        }),
      ),
    ),
  )
}

export const makeApp = (overrides: FixtureOverrides = {}) => {
  const resolvedProps: FixtureProps = {
    timer: { ...defaultTimerProps, ...overrides.timer },
    progress: { ...defaultProgressProps, ...overrides.progress },
    avatar: { ...defaultAvatarProps, ...overrides.avatar },
    clipboard: { ...defaultClipboardProps, ...overrides.clipboard },
    qrCode: { ...defaultQrCodeProps, ...overrides.qrCode },
  }

  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [
        Part.given(Timer.make({ name: 'Timer' }), () => resolvedProps.timer),
        Part.given(
          Progress.make({ name: 'Progress' }),
          () => resolvedProps.progress,
        ),
        Part.given(Avatar.make({ name: 'Avatar' }), () => resolvedProps.avatar),
        Part.given(
          Clipboard.make({ name: 'Clipboard' }),
          () => resolvedProps.clipboard,
        ),
        Part.given(QrCode.make({ name: 'QrCode' }), () => resolvedProps.qrCode),
      ],
      screen: (model, views) => cluster5Screen(model, views, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Cluster5Message =
  | Timer.Message
  | Progress.Message
  | Avatar.Message
  | Clipboard.Message
  | QrCode.Message

export type Running = Readonly<{
  props: FixtureProps
  model: () => Model
  timerState: () => Timer.State
  progressState: () => Progress.State
  avatarState: () => Avatar.State
  clipboardState: () => Clipboard.State
  qrCodeState: () => QrCode.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Cluster5Message) => void
}>

export const start = (overrides: FixtureOverrides = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    timerState: () => held.model.parts['Timer'],
    progressState: () => held.model.parts['Progress'],
    avatarState: () => held.model.parts['Avatar'],
    clipboardState: () => held.model.parts['Clipboard'],
    qrCodeState: () => held.model.parts['QrCode'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
