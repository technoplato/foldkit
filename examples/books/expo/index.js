// The engine's missing built-ins come first, before any module of the
// Program is read; then Expo Router's own entry.
require('./src/polyfill')
require('expo-router/entry')
