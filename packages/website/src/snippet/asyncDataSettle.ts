const LoadAllNotes = Command.define(
  'LoadAllNotes',
  SettledLoadAllNotes,
)(
  pipe(
    fetchAllNotes,
    Effect.result,
    Effect.map(result => SettledLoadAllNotes({ result })),
  ),
)

M.tagsExhaustive({
  SettledLoadAllNotes: ({ result }) => [
    evo(model, {
      allNotes: previous => AsyncData.settle(previous, result),
    }),
    [],
  ],
})
