import type { Actions, AppMessage, AppModel } from 'counter-core-example'

declare module '@foldkit/react' {
  interface BoundPrograms {
    readonly Counter: {
      readonly model: AppModel
      readonly message: AppMessage
      readonly actions: Actions
    }
  }
}
