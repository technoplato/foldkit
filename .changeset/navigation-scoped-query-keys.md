---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': patch
'@foldkit/opentui': patch
---

Each stack entry's query keys are now prefixed with the path segments that entry prints, so two screens in one stack can use the same key: a search page and the action menu print `/shop/search/menu?search.q=cats&menu.q=re`, and both values survive a reload. The root prints no segments of its own, so its keys stay bare. The action menu's filter is now `?menu.q=re` instead of `?q=re`; an old `?q=re` link opens the menu unfiltered. `FoldkitRouter` with no children renders every screen the Program declares through `NavigationFrame`, so an app writes no React Router routes for the Program's pages and a screen added to the Program needs no route.
