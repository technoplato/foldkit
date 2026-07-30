---
name: foldkit-view
description: Build pure, accessible Foldkit HTML and UI views with stable identity, factual event Messages, Submodels, Mounts, and CustomElements. Use for rendering, forms, reusable controls, list identity, DOM integration, accessibility, or removing imperative and view-local behavior.
---

# Foldkit View

Render Model as data and turn interaction into Messages. Keep state changes and
effects out of event handlers and out of the view function.

## Workflow

1. Read the nearest app view and the relevant `@foldkit/ui` component before
   writing a custom control.
2. Keep view pure. Event attributes construct factual Messages; update owns
   business decisions and Commands.
3. Use a stateful UI Submodel when the widget owns interaction state. Use a
   stateless render helper directly when it only renders configuration.
4. Route child input through `Got*Message` wrappers. Keep OutMessage handling in
   the parent update, not in a view callback.
5. Key mapped entities by stable Model identity. Do not key branches, formatted
   content, array positions, or values merely to force rerendering. Build with
   `@foldkit/vite-plugin` so branch identity is preserved.
6. Choose Mount only when an element's presence causes DOM work and the factory
   uses that element. Use CustomElement for native web components and
   ManagedResource for stateful handles needed by Commands.
7. Preserve semantic HTML, labels, accessible names, keyboard behavior, focus
   visibility, and external-link safety.
8. Prove the interaction through Scene locators and matchers. Add browser
   evidence only for layout, platform behavior, or DOM APIs Scene cannot model.

## Reject

- Imperative DOM mutation from view or update.
- Raw callbacks that change Model instead of constructing a Message.
- Host or module-local product state that duplicates Model.
- `NoOp` Messages used to satisfy an event type.
- A custom stateful widget when a Foldkit UI Submodel already owns the behavior.

## Source anchors

- `packages/foldkit/src/html/public.ts`
- `packages/foldkit/src/html/submodel.ts`
- `packages/foldkit/src/mount/public.ts`
- `packages/foldkit/src/customElement/public.ts`
- `packages/ui/src/`
- `examples/auth/src/view.ts`
- `examples/kanban/src/main.ts`
- `examples/ui-showcase/src/main.ts`
