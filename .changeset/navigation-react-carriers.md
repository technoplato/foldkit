---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
---

React hosts now navigate. `@foldkit/react/navigation` adds `NavigationFrame`, which paints the bound Program's navigation frame, `useBrowserHistory`, which keeps the address bar and browser Back on the Program's plan, and `useNavigationFrame`, `useNavigationPlan`, and `useViewAt`. `@foldkit/react/react-router` adds `FoldkitRouter`, a React Router controlled by the Program: its location is the plan URI, and `<Link>` and `useNavigate` send `OpenedUri` instead of writing history. `ActionMenuPanel` paints one menu, and `paintTree` marks dim and mono text and opens in-app links through `onLink`. `@foldkit/react-native/react-navigation` adds `FoldkitStack`, a React Navigation native stack with one keyed route per plan entry, where a swipe or the Android back button reaches the Program as `NavigatedBack`, plus `reactNavigationStack` and `useDeepLinks`. `ActionMenuSheet` paints the menu without a Modal. `Navigation.uriOfDeepLink` reads the in-app URI of a deep link, such as `/counter/session` from `foldkit-counter://counter/session`.
