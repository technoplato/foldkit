import { LoadedCatalog, idlePlayback, seedTranscripts } from "transcribe-core-example"
import { Option } from "effect"
import { describe, expect, it } from "vitest"

import { messageForInput, renderTranscribeScreen } from "./host.js"

const model = {
  catalog: LoadedCatalog.make({ jobs: seedTranscripts }),
  draftUrl: "",
  selectedId: Option.none(),
  source: "Instant" as const,
  ...idlePlayback,
}

describe("Transcribe TUI", () => {
  it("renders Knophy transcribe and maps number keys", () => {
    const screen = renderTranscribeScreen(model)
    expect(screen).toContain("Knophy transcribe")
    expect(messageForInput("1", model)._tag).toBe("Some")
    expect(messageForInput("q", model)._tag).toBe("None")
  })
})
