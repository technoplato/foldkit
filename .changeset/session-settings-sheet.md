---
'foldkit': minor
---

Session settings is a Sheet over the page you are on instead of a pushed page: `/counter/session` presents it over the Counter, and `/counters/3/session` over Counter 3's page. A stack holds one modal, so the action menu waits while the Sheet is open (`/counter/session/menu` parses to `/counter/session`), choosing `Session settings` from the menu replaces the menu with the Sheet, and `OpenSessionSettings` is unavailable while another dialog is open ("another screen is open on top").
