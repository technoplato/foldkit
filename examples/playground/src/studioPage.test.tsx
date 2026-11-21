/** @jsxImportSource react */
// @vitest-environment happy-dom
import { Catalog } from 'foldkit'
import * as Declaration from 'foldkit/declaration'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { StudioAppRoot, executeStudioCliLine } from './studioPage'
import {
  ArchiveIssue,
  CreateIssue,
  CutRelease,
  LowerPriority,
  RaisePriority,
  ResetStudio,
  StudioCoreProgram,
  ToggleIssueStatus,
  createBoundStudio,
  initialStudioModel,
  studioCatalog,
} from './studioProgram'

beforeEach(() => {
  window.history.replaceState(null, '', '/studio')
})

afterEach(() => {
  cleanup()
})

describe('StudioProgram & StudioDemoShell (/studio)', () => {
  it('declares every Studio Action cleanly with zero client words and verified touches', () => {
    const declarations = Catalog.declarationsOf(studioCatalog)
    for (const declaration of declarations) {
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    }

    const base = initialStudioModel()
    const sampleModels = [base]
    const sampleMessages = [
      ToggleIssueStatus({ slug: 'surface-drag' }),
      RaisePriority({ slug: 'cli-bridge' }),
      LowerPriority({ slug: 'mobile-touch' }),
      CreateIssue({ title: 'Audit drag threshold' }),
      ArchiveIssue({ slug: 'cli-bridge' }),
      CutRelease(),
      ResetStudio(),
    ]
    expect(
      Catalog.undeclaredTouches(
        studioCatalog,
        StudioCoreProgram.update,
        sampleModels,
        sampleMessages,
      ),
    ).toEqual([])
  })

  it('drives NavigationFrame across Root, Tab, Push, Sheet, Left Drawer, and Modal Dialog while updating live CLI output', () => {
    const { container } = render(<StudioAppRoot initialUri="/studio" />)

    expect(screen.getByTestId('studio-uri').textContent).toBe('/studio')
    expect(screen.getByTestId('studio-live-cli').textContent).toContain(
      'at /studio',
    )
    expect(screen.getByTestId('studio-live-cli').textContent).toContain(
      'Foldkit Release Studio',
    )
    expect(screen.getByTestId('studio-live-cli').textContent).toContain(
      '$ studio toggle-issue-status',
    )

    // 1. Push IssueDetailPage via 1-tap primitive button
    fireEvent.click(screen.getByRole('button', { name: /Issue Detail/i }))
    expect(screen.getByTestId('studio-uri').textContent).toBe(
      '/studio/issues/mobile-touch',
    )
    expect(screen.getByTestId('studio-live-cli').textContent).toContain(
      'Project InputMode, EnterKeyHint, Autofill, and DragAxis on Slot',
    )

    // 2. Present Sheet overlay (/studio/new)
    fireEvent.click(screen.getByRole('button', { name: /New Issue\s*Sheet/i }))
    expect(screen.getByTestId('studio-uri').textContent).toBe('/studio/new')
    expect(
      container.querySelector('.fk-overlay[data-style="Sheet"]'),
    ).not.toBeNull()
    expect(screen.getByTestId('studio-live-cli').textContent).toContain(
      'New Backlog Issue (Sheet)',
    )

    // 3. Present Left Drawer overlay (/studio/activity)
    fireEvent.click(screen.getByRole('button', { name: /Activity Log/i }))
    expect(screen.getByTestId('studio-uri').textContent).toBe(
      '/studio/activity',
    )
    expect(
      container.querySelector(
        '.fk-overlay[data-style="Drawer"][data-side="Left"]',
      ),
    ).not.toBeNull()

    // 4. Present Modal Dialog overlay (/studio/archive/surface-drag)
    fireEvent.click(screen.getByRole('button', { name: /Confirm Archive/i }))
    expect(screen.getByTestId('studio-uri').textContent).toBe(
      '/studio/archive/surface-drag',
    )
    expect(
      container.querySelector('.fk-overlay[data-style="Dialog"]'),
    ).not.toBeNull()

    // 5. Switch to Tab (/studio/releases)
    fireEvent.click(screen.getByRole('button', { name: /Releases\s*Tab/i }))
    expect(screen.getByTestId('studio-uri').textContent).toBe(
      '/studio/releases',
    )
    expect(screen.getByTestId('studio-live-cli').textContent).toContain('v0.4')
  })

  it('executes interactive CLI commands and updates both React NavigationFrame and CLI transcript live', () => {
    render(<StudioAppRoot initialUri="/studio" />)

    const cliInput = screen.getByLabelText('Studio CLI command')
    const runBtn = screen.getByRole('button', { name: 'Run' })

    // Navigate via CLI command: open /studio/issues/surface-drag
    fireEvent.change(cliInput, {
      target: { value: 'open /studio/issues/surface-drag' },
    })
    fireEvent.click(runBtn)
    expect(screen.getByTestId('studio-uri').textContent).toBe(
      '/studio/issues/surface-drag',
    )
    expect(screen.getByTestId('studio-react-frame').textContent).toContain(
      'Move single-pointer surfaceDragMount to foldkit/renderers',
    )

    // Mutate domain state via CLI command: toggle-issue-status surface-drag
    fireEvent.change(cliInput, {
      target: { value: 'toggle-issue-status surface-drag' },
    })
    fireEvent.click(runBtn)
    expect(screen.getByTestId('studio-react-frame').textContent).toContain(
      'Status: Done',
    )

    // Create a new issue via CLI with quotes and step back to /studio
    fireEvent.change(cliInput, {
      target: { value: 'create-issue "Ship live CLI studio"' },
    })
    fireEvent.click(runBtn)
    fireEvent.change(cliInput, { target: { value: 'back' } })
    fireEvent.click(runBtn)
    expect(screen.getByTestId('studio-uri').textContent).toBe('/studio')
    expect(screen.getByTestId('studio-react-frame').textContent).toContain(
      'Ship live CLI studio',
    )

    // Typo command returns exit 2 with nearest derived usage
    const bound = createBoundStudio('/studio')
    const refusal = executeStudioCliLine(bound, 'cut-relase')
    expect(refusal.exitCode).toBe(2)
    expect(refusal.stderr).toContain('studio cut-release')
  })
})
