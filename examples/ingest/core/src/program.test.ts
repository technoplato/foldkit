import { describe, expect, it } from 'vitest'

import { classifyDeterministic, mapClassifierOutput } from './domain/index.js'
import {
  ClickedCaptureOther,
  ClickedCaptureVideo,
  ClickedCaptureX,
} from './message.js'
import { emptyModel } from './model.js'
import { productView } from './product.js'
import { IngestProgram, ingestScreen, ingestValid } from './program.js'

describe('IngestProgram', () => {
  it('owns valid and screen on Program.make', () => {
    const empty = emptyModel()
    expect(IngestProgram.valid).toBe(ingestValid)
    expect(IngestProgram.screen).toBe(ingestScreen)
    expect(ingestScreen(empty)).toEqual(productView(empty))
  })

  it('paints title library categories and actions', () => {
    const tree = productView(emptyModel())
    const text = JSON.stringify(tree)
    expect(text).toContain('Ingest')
    expect(text).toContain('Empty')
    expect(text).toContain('Recipe')
    expect(text).toContain('Restaurant')
    expect(text).toContain('capture')
  })
})

describe('Category', () => {
  it('maps classifier output onto the Category ADT', () => {
    expect(mapClassifierOutput('recipe')._tag).toBe('Recipe')
    expect(mapClassifierOutput('nope')._tag).toBe('Other')
  })

  it('classifies deterministically', () => {
    expect(classifyDeterministic('bake this recipe')._tag).toBe('Recipe')
    expect(classifyDeterministic('a random link')._tag).toBe('Other')
  })
})

describe('update', () => {
  it('starts a pasted capture', () => {
    const [next] = IngestProgram.update(emptyModel(), ClickedCaptureOther())
    expect(next.capture._tag).toBe('Drafting')
  })

  it('does not block the screen when X is unsigned', () => {
    const [next] = IngestProgram.update(emptyModel(), ClickedCaptureX())
    expect(next.xSession._tag).toBe('Unsigned')
    expect(next.notice._tag).toBe('Some')
  })

  it('does not block the screen when yt-dlp is missing', () => {
    const [next] = IngestProgram.update(emptyModel(), ClickedCaptureVideo())
    expect(next.videoTool._tag).toBe('Missing')
    expect(next.notice._tag).toBe('Some')
  })
})
