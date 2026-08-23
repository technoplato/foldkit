import type { Actions, Message, Model } from 'settings-core-example'

declare module '@foldkit/react' {
  interface BoundPrograms {
    readonly Settings: {
      readonly model: Model
      readonly message: Message
      readonly actions: Actions
    }
  }
}
