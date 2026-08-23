import type { Actions, Message, Model } from 'gate-core-example'

declare module '@foldkit/react' {
  interface BoundPrograms {
    readonly Gate: {
      readonly model: Model
      readonly message: Message
      readonly actions: Actions
    }
  }
}
