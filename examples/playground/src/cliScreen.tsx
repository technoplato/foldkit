/** @jsxImportSource foldkit */
import { Jsx } from 'foldkit/renderers'
import type { UiNode } from 'foldkit/renderers'

const { Box, Column, Progress, Row, Text, TextInput } = Jsx

export type CliPreviewProps = Readonly<{
  mode: 'Light' | 'Dark'
  displayName: string
  bio: string
  formValid: boolean
  localEventCount: number
  syncedWriteCount: number
  sliderValue: number
  ratingValue: number
  switchOn: boolean
  activeTab: string
  qrText: string
}>

const StatBadge = ({
  label,
  value,
}: Readonly<{ label: string; value: string }>): UiNode => (
  <Row gap={1}>
    <Text>{label}:</Text>
    <Text mono>{value}</Text>
  </Row>
)

export const PlaygroundCliScreen = (props: CliPreviewProps): UiNode => {
  const reduction =
    props.localEventCount === 0
      ? 0
      : Math.max(
          0,
          Math.round(
            ((props.localEventCount - props.syncedWriteCount) /
              props.localEventCount) *
              100,
          ),
        )

  return (
    <Box padding={1}>
      <Column gap={1}>
        <Row gap={2}>
          <Text emphasis="Headline">FOLDKIT CORE UI · 54 PARTS</Text>
          <Text>[{props.mode}]</Text>
        </Row>

        <Text>Zero-React JSX (foldkit/jsx-runtime) → UiNode → paintCli</Text>

        <Row gap={3}>
          <StatBadge label="Local" value={String(props.localEventCount)} />
          <StatBadge label="Synced" value={String(props.syncedWriteCount)} />
          <StatBadge label="Saved" value={`${reduction}%`} />
        </Row>

        <Column gap={0}>
          <Text emphasis="Headline">BoundField Profile</Text>
          <TextInput
            value={props.displayName}
            placeholder="Display name"
            label="displayName"
          />
          <Text>
            bio: {props.bio.slice(0, 44)}
            {props.bio.length > 44 ? '…' : ''} (
            {props.formValid ? 'valid' : 'invalid'})
          </Text>
        </Column>

        <Column gap={0}>
          <Text emphasis="Headline">Live Core Parts Snapshot</Text>
          <Row gap={2}>
            <Text mono>Switch: {props.switchOn ? '[ON]' : '[OFF]'}</Text>
            <Text mono>Tab: {props.activeTab}</Text>
            <Text mono>Rating: {props.ratingValue}/5</Text>
          </Row>
          <Progress
            value={props.sliderValue}
            max={100}
            label={`Slider ${props.sliderValue}%`}
          />
          <Text mono>QR payload: {props.qrText}</Text>
        </Column>
      </Column>
    </Box>
  )
}
