# Plan 04 | Navigation: both directions of adoption, and the shapes React Router and React Navigation have

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-19 to R2-21, R2-32, R3-11, R3-16, R4-11, R4-14, R4-15). Closes audit
item 5.

## What exists and stays

`NavigationStack { root, pages, maybeModal }` over a closed Destination union;
`PresentationStyle` (Push, Sheet, BottomSheet, FullScreenCover, Dialog,
Popover with an anchor, Drawer with a side); `Navigation.screens` with
`isAllowedAbove`; `foldMessage`, `pushed`, `presented`, `withoutDestinations`;
carriers for browser history, React Router (`FoldkitRouter`), React
Navigation (`FoldkitStack`), Expo Router (`FoldkitRouterStack`), and terminals
(`ownNavigationHosts`). Two modals at once and a page over a modal are
unrepresentable. This is the Swift-navigation shape the owner asked for, and it
is right.

## What is missing

1. **Inward adoption.** An existing app cannot mount a Program under one of its
   own routes. `FoldkitRouter` creates its own `<Router>`, so it cannot sit
   inside an existing `<BrowserRouter>`; the browser history carrier assumes
   the Program owns the whole address bar. The owner's case: `/legacy/counter`.
2. **Tabs.** React Navigation's tab navigator and React Router's layout routes
   hold several stacks at once. Foldkit holds one.
3. **A drawer as a container.** React Navigation's drawer navigator holds
   screens and stays open on wide layouts; Foldkit's `Drawer` is only a modal
   style.
4. **A stack inside a presentation.** A Sheet that pushes pages inside itself
   (SwiftUI `NavigationStack` inside `.sheet`) has no value: `Modal` holds one
   Destination.
5. **Shell.** A sidebar, a dock, or a tab bar that stays while the stack
   changes is painted by hosts today (Books has a Dock in a painter), not
   declared.
6. **Leave guards.** React Router's `useBlocker` and React Navigation's
   `beforeRemove` ask before leaving a dirty form; Foldkit has no declared
   equivalent.

## North Star

Inward, in an existing React Router app. The prefix is read from the matched
route, never typed twice:

```tsx
// the host's own router; Foldkit owns only /legacy/counter/*
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Marketing />} />
    <Route path="/account" element={<Account />} />
    <Route
      path="/legacy/counter/*"
      element={
        <ProgramProvider bound={counter}>
          <FoldkitOutlet />
        </ProgramProvider>
      }
    />
  </Routes>
</BrowserRouter>
```

Outward, in a Program-owned app with host pages (today's `FoldkitRouter`,
unchanged):

```tsx
<ProgramProvider bound={counter}>
  <FoldkitRouter>
    <Routes>
      <Route path="/about" element={<About />} />
      <Route path="*" element={<NavigationFrame />} />
    </Routes>
  </FoldkitRouter>
</ProgramProvider>
```

Inward, in an existing React Navigation stack. A function, not a component,
because a navigator accepts only `Screen`, `Group`, and fragments as direct
children, and nothing else between them (R2-21):

```tsx
<Stack.Navigator>
  <Stack.Screen name="Home" component={Home} />
  {foldkitScreens(Stack, counter, { routeName: 'counter' })}
</Stack.Navigator>
```

Tabs, declared in core, one typed stack per tab:

```ts
export const navigation = Navigation.tabs({
  slug: 'finance',
  tabs: {
    dashboard: Dashboard.navigation, // /finance/dashboard/...
    accounts: Accounts.navigation, // /finance/accounts/...
  },
  initial: 'dashboard',
  shell: Shell.tabBar({ placement: 'Bottom' }),
  switchWhileModal: SwitchWhileModal.dismiss,
})
```

A drawer as a container, holding tabs, holding stacks:

```ts
export const navigation = Navigation.drawer({
  slug: 'books',
  items: {
    library: Library.navigation,
    reading: Reading.tabs,
    settings: Settings.navigation,
  },
  initial: 'library',
  shell: Shell.sidebar({ side: 'Left', persistentAbove: Breakpoint.lg }),
})
```

A stack inside a Sheet, pages only:

```ts
Navigation.presentScreen(AccountEditor, route, Navigation.Sheet(), {
  title: (destination, view) => accountName(view, destination.accountId),
  pages: AccountEditor.pages, // a PageStack<EditorDestination>: root and pages, no modal of its own
})
```

A leave guard, as the guarded screen's own state (never a second modal):

```ts
Navigation.pushScreen(EditAsset, route, {
  title: () => 'Edit asset',
  leaving: view =>
    M.value(Forms.at(view, EditAsset)).pipe(
      M.tagsExhaustive({
        Submitting: () => Leaving.allowed,
        Editing: ({ draft }) =>
          Forms.isDirty(draft) ? Leaving.ask : Leaving.allowed, // the screen paints its own "Discard your changes?" strip
      }),
    ),
})
```

## Inward adoption: the prefix

The Program's URIs do not change (`/counter`, `/counter/session`). The prefix
is a carrier concern, owned by the host:

- `FoldkitOutlet` takes its prefix as the matched route's `pathnameBase`,
  which React Router computes for every match. Without a data router there is
  no `useMatches`, so the host writes the pattern once through
  `foldkitRoute('legacy/counter', bound)`, which returns the `<Route>` with
  its `path` and an element that recomputes `pathnameBase` with `matchPath`
  from that same pattern. Subtracting the decoded splat from the encoded
  pathname is not used, because a `%2F` inside a segment breaks it, and
  React Router 8.3.0's `useResolvedPath('.')` returns the leaf match's full
  pathname inside a splat route (R2-19). The outlet reads the parent router's
  location with `useLocation`, writes with `useNavigate`, and never creates a
  `<Router>`. Tests cover `/legacy/counter`, `/legacy/counter/`, and a nested
  splat. It renders `NavigationFrame` for the Program's screens. A text link
  to `/account` inside a Program screen leaves the Program the way a host
  `<Link>` would.
- The browser carrier takes `prefix` from the outlet; `bound.ownsUri` is asked
  with the stripped URI, so an address outside the prefix is never the
  Program's.
- React Navigation: `foldkitScreens(Stack, bound, { routeName })` returns a
  `<Stack.Group>` with one keyed screen per plan entry under a route name the
  host chooses, so two Programs in one navigator do not collide. Ownership
  rule: the host owns the routes below the mount; the Model owns the routes
  from the mount up to the last Program entry; a host screen pushed above a
  Program entry (a notification, a deep link into a host page) stays above
  it, and the suffix driver writes only the Program's span. While a host
  screen covers the span, the carrier reports `CoveredByHost` to the
  runtime, `Navigation.current` is the covered page but every Action there is
  `Disabled({ because: 'a host screen is open' })`, so keys, the menu, and
  agents stop acting on the Program (R3-11). A Program move that arrives
  while covered (a peer under Mirror, an agent) dismisses the covering host
  screens and shows the new page (proposed; the owner may choose to hold the
  move until the person comes back, decision below); a `reconcile` move while
  covered follows the same rule. `CoveredByHost` is a Local fact and
  `LeftProgram` a Navigation fact, both declared by the runtime for every
  Program (plan 02, R4-11), so one phone's host screen never disables a
  Mirror peer, and the cover reaches `availabilityOf` through its runtime
  input. A host pop that removes
  the Program's root is reported as `LeftProgram`, not `NavigatedBack`, and
  the Model returns to its root. Today's driver resets the whole navigator on
  every Program move (`packages/react-native/src/reactNavigation/foldkitStack.tsx`),
  which is what the suffix driver replaces. All four cases are tested. Expo
  Router: `app/legacy/counter/[...path].tsx` with the prefix from the route.
- Terminals have no prefix; the terminal carrier takes no such option.

The law `parse(print(d)) = d` holds on the stripped URI; a test asserts that
`print` under a prefix is the Program's print with the prefix prepended and
nothing else.

## Tabs

```ts
export const Tabs = <Stacks extends Record<string, S.Top>>(stacks: Stacks) =>
  S.Struct({ active: S.Literals(keysOf(stacks)), stacks: S.Struct(stacks) }) // a Schema, like NavigationStack
```

- The Model holds `Tabs` when the declaration is `Navigation.tabs`, one typed
  stack per tab, so an `AccountDetail` cannot sit in the dashboard's stack.
  One modal at a time still holds: the active stack's `maybeModal` is the
  only modal; switching tabs with a modal open dismisses it or is refused, by
  the declaration's `switchWhileModal`.
- The URI names the active tab by its slug and prints the active stack.
  Inactive stacks are device state (as on iOS), so the law is restated for
  tabs: `parse(print(t))` equals `t` with every inactive stack reset to its
  root, and the test asserts that.
- `SelectedTab` is a Navigation Message. Under Mirror it mirrors like any
  other, and a peer that never had the stack behind that tab shows that
  tab's root, which is what a newcomer sees too. Whether inactive stacks
  sync and survive a reload is a decision in the README.
- Hosts: `NavigationFrame` paints the active stack and the declared shell;
  React Navigation maps to a tab navigator with one `FoldkitStack` per tab;
  terminals paint the tab bar as a footer and switch with number keys (the
  menu's `⌘1-9` picks already exist).

## Drawer as a container

`Navigation.drawer({ items, initial, shell })` holds named navigations the
way `tabs` does, with a `Sidebar` shell that stays open above a breakpoint
and slides in below it. `Drawer({ from })` the modal style remains for a
single presented Destination that slides in. React Navigation maps the
container to a drawer navigator; React Router to a layout route with an
`<Outlet>`; terminals to a left column. Nesting composes: a drawer holding
tabs holding stacks is three declarations, each printing its segment of the
URI.

## A stack inside a presentation

A presented screen may declare `pages: PageStack<Inner>`, where
`PageStack<Inner> = { root: Inner, pages: ReadonlyArray<Inner> }` has no
`maybeModal`, so a modal over a modal stays unrepresentable, and `Inner` is
its own Destination type. `NavigatedBack` pops the inner pages first, then
dismisses. Printing is `/finance/accounts/edit/<id>/holdings`: the modal's
route, then its inner pages.

## Shell

`Navigation.screens({ shell })` declares what stays: `Shell.tabBar`,
`Shell.sidebar({ side, persistentAbove })`, `Shell.dock({ items })`. Shell is
painted from the declaration by every host, so Books' Dock moves out of its
painter into its navigation. "Shell", not "chrome": the glossary's Chrome is
cross-cutting UI state such as the action menu.

## Leave guards

`leaving: (view) => Leaving.allowed | Leaving.ask` on a screen makes a pop
or a tab switch a question the guarded screen itself paints, as its own
state: the `guard` (`Quiet | Asking`) inside the Destination's `FormState` in
the DeviceOwned `forms` field (plan 02), so the guard's answer `Leaving` and
the state do not share a name (R3-16), and a Mirror peer never paints the
question over a form that is empty there (R4-15), never a second modal, so a guarded Sheet needs no modal over a modal (R2-20). The
answer is an Action (`DiscardChanges`, `KeepEditing`). On the web, `popstate`
fires after history has moved, so the carrier restores the address and
reports the attempt as a Message rather than blocking; `useBlocker` needs a
data router and neither carrier is one, so it is not used. On React
Navigation, `beforeRemove` can hold a programmatic pop; whether the native
stack's swipe-back can be held is checked per version before the carrier
claims it.

## Parity table

| Shape                          | React Router                 | React Navigation      | Foldkit after this plan                                             |
| ------------------------------ | ---------------------------- | --------------------- | ------------------------------------------------------------------- |
| Stack                          | nested routes                | native stack          | `NavigationStack`                                                   |
| Modal, sheet, dialog           | route plus state             | `presentation` option | `maybeModal` with a style                                           |
| Drawer (slide-in)              | layout plus state            | drawer navigator      | `Drawer({ from })` as a modal style                                 |
| Drawer (container, persistent) | layout route with `<Outlet>` | drawer navigator      | `Navigation.drawer` with a `Sidebar` shell                          |
| Tabs                           | layout route with `<Outlet>` | tab navigator         | `Navigation.tabs`                                                   |
| Stack in a modal               | nested routes                | nested stack          | `pages` on a presented screen                                       |
| Nested navigators              | nested layout routes         | nested navigators     | drawer holding tabs holding stacks                                  |
| Leave guard                    | `useBlocker` (data routers)  | `beforeRemove`        | `leaving` on a screen, painted by the screen, answered by an Action |
| Host pages beside a Program    | `<Routes>` children          | host screens          | `FoldkitRouter` children (exists)                                   |
| Program inside a host route    | `<Route path="x/*">`         | screen group          | `FoldkitOutlet`, `foldkitScreens(Stack, bound, { routeName })`      |
| Deep link                      | location                     | linking config        | `launchUri` through the carrier (exists)                            |

## Migration

1. `prefix` on the browser carrier and `FoldkitOutlet`; the trial in
   `examples/counter/react/trial` becomes `examples/counter/react-router`, a
   typechecked, knip-checked package with both directions as tests.
2. `foldkitScreens` and the suffix driver for React Navigation.
3. `Navigation.tabs` and `Tabs` in the Model; the finance example (plan 08)
   is the first user.
4. `Navigation.drawer`, `pages` on presented screens, `shell`, `leaving`;
   Books' Dock moves into its navigation.

## Decisions for the owner

1. Tabs: do inactive stacks sync across devices under Mirror, and survive a
   reload? Proposed: neither; a tab you did not visit on this device starts
   at its root.
2. A drawer: keep both the modal style and the container (proposed), or one.
3. A Program move while a host screen covers it in React Navigation: dismiss
   the covering host screens and show the page (proposed), or hold the move
   until the person returns (R3-11).
