# Conversations

One renderer-free Foldkit Program. Every UI is a Client.

`identifier.cursor` is one host name among many. The Program never talks about
Cursor hooks, `?cursor=` query params, Tree-sitter, or vim chords.

## Layout

```text
core/             Program: Model, Message, update, derived breakdown
cli/              One-shot argv Client. Prove the Program here first.
tui/              Terminal UI Client. Keys become Messages.
foldkit/          Foldkit HTML Client
react-bindings/   useConversationsActions / useConversationsModel
react/            Vite React Client (thin hooks + view)
next/             Next App Router Client source (same hooks; drop into Next)
sveltekit/        SvelteKit Client (ProgramRuntime + view)
```

## CLI (non-captive)

```bash
pnpm --filter conversations-core-example test
pnpm --filter conversations-cli-example test
pnpm --filter conversations-cli-example conversations -- show
pnpm --filter conversations-cli-example conversations -- do identifier:grok:bot:distraction-blocker
pnpm --filter conversations-cli-example conversations -- do open:c-cmux find:bash next
```

Tokens map to canonical Messages. `next` / `prev` read Model, then send
`ClickedJumpTo`. The Program does not know about argv.

## React

```tsx
const actions = useConversationsActions()
const screenTag = useConversationsModel({
  selector: model => model.screen._tag,
})

return <button onClick={actions.clickedOpenChats}>{screenTag}</button>
```

Vim keys, markdown, and Tree-sitter belong in a graphical Client, not in
`core/`.
