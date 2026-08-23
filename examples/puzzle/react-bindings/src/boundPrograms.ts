import type { Actions, AppMessage, AppModel } from 'puzzle-core-example'

declare module '@foldkit/react' {
  interface BoundPrograms {
    readonly Puzzle: {
      readonly model: AppModel
      readonly message: AppMessage
      readonly actions: Actions
    }
  }
}
