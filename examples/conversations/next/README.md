Drop `app/page.tsx` and `app/layout.tsx` into a Next.js App Router app.

This package typechecks the Client as React. It does not vendor Next, because Next
pulls `sharp` and Foldkit's pnpm allowBuilds list does not include it.

The page is the thin adapter: `useConversationsActions` and
`useConversationsModel({ selector })`. All conversation logic stays in
`conversations-core-example`.
