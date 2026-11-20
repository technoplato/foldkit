---
'foldkit': minor
'@foldkit/react-native': patch
---

A page a tab bar reaches is now declared once, on its screen: `Navigation.pushScreen(ProfilePage, Route.literal('profile'), { isTab: true })`. The route and every carrier plan entry carry `isTab`, so each Client reads the same fact. On a phone, the native stack shows a tab page with no arrival animation, no back button and no swipe back, and keeps the page beneath mounted, so Books' Profile no longer slides in over the library with a back chevron. Back still returns to the page beneath on every Client.

Breaking: `Session.compose` no longer takes `isTab`. Move it to the page's screen, as above. Session reads it from the route and leaves the Back button off the page as before. `DestinationRoute` and `CarrierEntry` each gain a required `isTab: boolean`, so a route or an entry built by hand must set it.
