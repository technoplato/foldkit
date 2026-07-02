export const noteNotebookId = (
  model: Model,
  noteId: NoteId,
): Option.Option<NotebookId> =>
  pipe(
    model.noteById,
    HashMap.get(noteId),
    Option.flatMap(noteData => AsyncData.getData(noteData)),
    Option.flatMap(note => note.maybeNotebookId),
  )
