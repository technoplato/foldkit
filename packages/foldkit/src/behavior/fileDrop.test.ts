import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as FileDrop from './fileDrop.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const pdfFile: FileDrop.FileEntry = {
  name: 'resume.pdf',
  size: 2048,
  type: 'application/pdf',
  lastModified: 1000,
}

const pngFile: FileDrop.FileEntry = {
  name: 'avatar.PNG',
  size: 1024,
  type: 'image/png',
  lastModified: 2000,
}

const largePdf: FileDrop.FileEntry = {
  name: 'archive.pdf',
  size: 50_000,
  type: 'application/pdf',
  lastModified: 3000,
}

const tinyPdf: FileDrop.FileEntry = {
  name: 'empty.pdf',
  size: 10,
  type: 'application/pdf',
  lastModified: 4000,
}

const docFile: FileDrop.FileEntry = {
  name: 'notes.doc',
  size: 512,
  type: 'application/msword',
  lastModified: 5000,
}

const baseProps: FileDrop.Props = {
  id: 'attachments',
  label: 'Upload attachments',
  accept: ['application/pdf', 'image/*', '.doc'],
  multiple: true,
  maxFiles: 2,
  minFileSize: 100,
  maxFileSize: 10_000,
}

const fold = (
  messages: ReadonlyArray<FileDrop.Message>,
  props: FileDrop.Props = baseProps,
  from: FileDrop.State = FileDrop.initial,
): FileDrop.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => FileDrop.chart.transition(state, message, props)[0],
  )

describe('core FileDrop Part', () => {
  describe('declaration, chart integrity, IDs, and schema serialization', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(FileDrop.part)).toEqual([])
      expect(Part.problemsOf(FileDrop.deviceOnly())).toEqual([])
      expect(Part.problemsOf(FileDrop.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(FileDrop.make({ defaultFiles: [pdfFile] })),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'FileDrop', chart: FileDrop.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'FileDropWithFiles',
          chart: FileDrop.chartOf(FileDrop.initialWithFiles([pdfFile])),
        }),
      ).toEqual([])

      for (const action of FileDrop.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and formats accept attributes cleanly', () => {
      expect(FileDrop.dropzoneId('attachments')).toBe('attachments-dropzone')
      expect(FileDrop.triggerId('attachments')).toBe('attachments-trigger')
      expect(FileDrop.itemId('attachments', 'resume.pdf')).toBe(
        'attachments-item-resume.pdf',
      )
      expect(FileDrop.removeButtonId('attachments', 'resume.pdf')).toBe(
        'attachments-remove-resume.pdf',
      )
      expect(FileDrop.clearButtonId('attachments')).toBe('attachments-clear')

      expect(
        FileDrop.formatAcceptAttribute([' application/pdf ', '.doc', '']),
      ).toEqual(Option.some('application/pdf,.doc'))
      expect(FileDrop.formatAcceptAttribute([])).toEqual(Option.none())
      expect(FileDrop.formatAcceptAttribute(undefined)).toEqual(Option.none())
    })

    it('round-trips Idle and DraggingOver states through Effect Schema JSON encoding', () => {
      const dragging = fold([
        FileDrop.AddFiles({ files: [pdfFile, largePdf] }),
        FileDrop.EnterDragZone(),
        FileDrop.EnterDragZone(),
      ])
      for (const state of [FileDrop.initial, dragging]) {
        const encoded = S.encodeUnknownSync(FileDrop.State)(state)
        const decoded = S.decodeUnknownSync(FileDrop.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('drag nesting depth and non-file drops', () => {
    it('tracks nested drag enter/leave counts without child flicker', () => {
      const enteredOnce = fold([FileDrop.EnterDragZone()])
      expect(FileDrop.isDraggingOver(enteredOnce)).toBe(true)
      expect(FileDrop.dragDepthOf(enteredOnce)).toBe(1)
      expect(FileDrop.dataStateOf(enteredOnce)).toBe('dragging')

      const enteredChild = fold(
        [FileDrop.EnterDragZone()],
        baseProps,
        enteredOnce,
      )
      expect(FileDrop.dragDepthOf(enteredChild)).toBe(2)

      const leftChild = fold(
        [FileDrop.LeaveDragZone()],
        baseProps,
        enteredChild,
      )
      expect(FileDrop.isDraggingOver(leftChild)).toBe(true)
      expect(FileDrop.dragDepthOf(leftChild)).toBe(1)

      const leftRoot = fold([FileDrop.LeaveDragZone()], baseProps, leftChild)
      expect(FileDrop.isIdle(leftRoot)).toBe(true)
      expect(FileDrop.dragDepthOf(leftRoot)).toBe(0)
      expect(FileDrop.dataStateOf(leftRoot)).toBe('idle')
    })

    it('sets hasNonFileDrop on DropNonFiles or empty DropFiles and resets drag state', () => {
      const droppedText = fold([
        FileDrop.EnterDragZone(),
        FileDrop.DropNonFiles(),
      ])
      expect(FileDrop.isIdle(droppedText)).toBe(true)
      expect(FileDrop.hasNonFileDrop(droppedText)).toBe(true)
      expect(FileDrop.isInvalidOf(droppedText, baseProps)).toBe(true)

      const droppedEmpty = fold([
        FileDrop.EnterDragZone(),
        FileDrop.DropFiles({ files: [] }),
      ])
      expect(FileDrop.isIdle(droppedEmpty)).toBe(true)
      expect(FileDrop.hasNonFileDrop(droppedEmpty)).toBe(true)

      const clearedNotice = fold(
        [FileDrop.ClearRejectedFiles()],
        baseProps,
        droppedEmpty,
      )
      expect(FileDrop.hasNonFileDrop(clearedNotice)).toBe(false)
    })
  })

  describe('accept matching, size/count/duplicate validation, and file list mutations', () => {
    it('matches exact MIME types, wildcards, and case-insensitive extensions', () => {
      expect(FileDrop.matchesAcceptPattern(pdfFile, 'application/pdf')).toBe(
        true,
      )
      expect(FileDrop.matchesAcceptPattern(pngFile, 'image/*')).toBe(true)
      expect(FileDrop.matchesAcceptPattern(docFile, '.DOC')).toBe(true)
      expect(FileDrop.matchesAcceptPattern(pdfFile, 'image/*')).toBe(false)
      expect(FileDrop.matchesAcceptPattern(pdfFile, '*/*')).toBe(true)
      expect(FileDrop.isFileAccepted(pdfFile, undefined)).toBe(true)
      expect(FileDrop.isFileAccepted(pdfFile, [])).toBe(true)
    })

    it('partitions accepted and rejected files with typed RejectionReasons', () => {
      const badType: FileDrop.FileEntry = {
        name: 'script.js',
        size: 500,
        type: 'text/javascript',
      }
      const next = fold([
        FileDrop.DropFiles({
          files: [
            pdfFile,
            pngFile,
            docFile,
            largePdf,
            tinyPdf,
            badType,
            pdfFile,
          ],
        }),
      ])
      expect(FileDrop.isIdle(next)).toBe(true)
      expect(FileDrop.acceptedFilesOf(next)).toEqual([pdfFile, pngFile])
      expect(FileDrop.isMaxFilesReached(next, baseProps)).toBe(true)
      expect(FileDrop.remainingSlotsOf(next, baseProps)).toEqual(Option.some(0))

      expect(FileDrop.rejectedFilesOf(next)).toEqual([
        { file: docFile, reasons: ['TooManyFiles'] },
        { file: largePdf, reasons: ['FileTooLarge'] },
        { file: tinyPdf, reasons: ['FileTooSmall'] },
        { file: badType, reasons: ['FileInvalidType'] },
        { file: pdfFile, reasons: ['FileDuplicate'] },
      ])
    })

    it('replaces the single attached file when multiple is false', () => {
      const singleProps: FileDrop.Props = {
        id: 'single',
        multiple: false,
        accept: ['application/pdf', 'image/*'],
      }
      const first = fold([FileDrop.AddFiles({ files: [pdfFile] })], singleProps)
      expect(FileDrop.acceptedFilesOf(first)).toEqual([pdfFile])

      const replaced = fold(
        [FileDrop.AddFiles({ files: [pngFile] })],
        singleProps,
        first,
      )
      expect(FileDrop.acceptedFilesOf(replaced)).toEqual([pngFile])
    })

    it('supports RemoveFile, RemoveRejectedFile, SetFiles, and ClearFiles', () => {
      const added = fold([
        FileDrop.AddFiles({ files: [pdfFile, pngFile, largePdf] }),
      ])
      const removed = fold(
        [FileDrop.RemoveFile({ name: 'resume.pdf' })],
        baseProps,
        added,
      )
      expect(FileDrop.acceptedFilesOf(removed)).toEqual([pngFile])
      expect(FileDrop.remainingSlotsOf(removed, baseProps)).toEqual(
        Option.some(1),
      )

      const removedRejected = fold(
        [FileDrop.RemoveRejectedFile({ name: 'archive.pdf' })],
        baseProps,
        removed,
      )
      expect(FileDrop.rejectedFilesOf(removedRejected)).toEqual([])

      const replaced = fold(
        [FileDrop.SetFiles({ files: [docFile] })],
        baseProps,
        removedRejected,
      )
      expect(FileDrop.acceptedFilesOf(replaced)).toEqual([docFile])

      const cleared = fold([FileDrop.ClearFiles()], baseProps, replaced)
      expect(FileDrop.acceptedFilesOf(cleared)).toEqual([])
      expect(FileDrop.rejectedFilesOf(cleared)).toEqual([])
      expect(FileDrop.hasAnyFiles(cleared)).toBe(false)
    })

    it('blocks interaction when isDisabled or isReadOnly is true', () => {
      const disabledProps: FileDrop.Props = { ...baseProps, isDisabled: true }
      const readOnlyProps: FileDrop.Props = { ...baseProps, isReadOnly: true }

      expect(FileDrop.isInteractive(disabledProps)).toBe(false)
      expect(FileDrop.isInteractive(readOnlyProps)).toBe(false)

      const afterDisabled = fold(
        [
          FileDrop.EnterDragZone(),
          FileDrop.DropFiles({ files: [pdfFile] }),
          FileDrop.DropNonFiles(),
        ],
        disabledProps,
      )
      expect(afterDisabled).toEqual(FileDrop.initial)

      const afterReadOnly = fold(
        [FileDrop.AddFiles({ files: [pdfFile] })],
        readOnlyProps,
      )
      expect(afterReadOnly).toEqual(FileDrop.initial)
    })
  })

  describe('slots, reference stability, sync, rest, and Part.compose', () => {
    it('projects reference-stable SlotBindings for Dropzone, Trigger, Item, RemoveButton, and ClearButton', () => {
      const initialView = Part.view(FileDrop.part, FileDrop.initial, baseProps)
      expect(Part.view(FileDrop.part, FileDrop.initial, { ...baseProps })).toBe(
        initialView,
      )

      const dropzoneAria = Slot.ariaOf(initialView.slot('Dropzone'))
      expect(dropzoneAria['role']).toBe('region')
      expect(dropzoneAria['id']).toBe('attachments-dropzone')
      expect(dropzoneAria['aria-current']).toBe('false')
      expect(dropzoneAria['aria-label']).toBe('Upload attachments')

      const triggerBefore = initialView.slot('Trigger')
      expect(Slot.ariaOf(triggerBefore)['role']).toBe('button')
      expect(
        Slot.ariaOf(initialView.slot('ClearButton'))['aria-disabled'],
      ).toBe('true')

      const populated = fold([
        FileDrop.AddFiles({ files: [pdfFile] }),
        FileDrop.EnterDragZone(),
      ])
      const activeView = Part.view(FileDrop.part, populated, baseProps)
      expect(Slot.ariaOf(activeView.slot('Dropzone'))['aria-current']).toBe(
        'true',
      )
      expect(Slot.ariaOf(activeView.slot('Item', 'resume.pdf'))['role']).toBe(
        'group',
      )
      expect(
        Slot.ariaOf(activeView.slot('RemoveButton', 'resume.pdf'))[
          'aria-label'
        ],
      ).toBe('Remove resume.pdf')
      expect(
        Slot.ariaOf(activeView.slot('ClearButton'))['aria-disabled'],
      ).toBeUndefined()
      expect(activeView.slot('Trigger')).toBe(triggerBefore)
    })

    it('settles DraggingOver to Idle in atRest while preserving files and supports synced/deviceOnly', () => {
      const dragging = fold([
        FileDrop.AddFiles({ files: [pdfFile] }),
        FileDrop.EnterDragZone(),
      ])
      const rested = FileDrop.atRest(dragging)
      expect(FileDrop.isIdle(rested)).toBe(true)
      expect(FileDrop.acceptedFilesOf(rested)).toEqual([pdfFile])

      expect(FileDrop.synced.AddFiles).toEqual(Synced())
      expect(FileDrop.deviceSync('OwnView').AddFiles).toEqual(
        Device({ because: 'OwnView' }),
      )

      const KeepTitle = Catalog.action('KeepTitle', {
        what: 'Keeps the upload title unchanged',
        why: 'To verify local part composition in a minimal Program',
        meta: { label: 'Keep title', keys: [] },
      })
      const Base = makeProgram({
        id: 'file-drop-compose-test',
        version: 1,
        Model: S.Struct({ title: S.String }),
        Message: Catalog.make([KeepTitle]).Message,
        init: () => [{ title: 'Upload' }, []],
        update: (model: Readonly<{ title: string }>) => [model, []],
      })
      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(FileDrop.deviceOnly(), () => baseProps)],
      })
      const [localModel] = LocalApp.init()
      expect(S.encodeUnknownSync(LocalApp.Model)(localModel)).toEqual({
        title: 'Upload',
      })
    })
  })
})
