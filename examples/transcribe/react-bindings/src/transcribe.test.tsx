import { type ReactNode, StrictMode } from "react"
import { describe, expect, it } from "vitest"

import { act, renderHook } from "@testing-library/react"

import { TranscribeProvider, useTranscribeActions, useTranscribeModel } from "./index.js"

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <TranscribeProvider>{children}</TranscribeProvider>
  </StrictMode>
)

describe("Transcribe React bindings", () => {
  it("observes the shared Transcribe Model and exposes stable actions", () => {
    const { result } = renderHook(
      () => ({
        actions: useTranscribeActions(),
        model: useTranscribeModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(
      result.current.model.catalog._tag === "LoadingCatalog" ||
        result.current.model.catalog._tag === "LoadedCatalog",
    ).toBe(true)

    act(() => {
      result.current.actions.updatedDraftUrl("https://youtu.be/B0FaK0sazXg")
    })
    expect(result.current.model.draftUrl).toBe("https://youtu.be/B0FaK0sazXg")
    expect(result.current.actions).toBe(actions)
  })
})
