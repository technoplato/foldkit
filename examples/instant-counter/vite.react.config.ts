import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { multipleCountersV3DebugLoginLoopbackPort } from './src/v3Demo/shared/debugLogin.js'

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5174,
    proxy: {
      '/__foldkit-debug': {
        target: `http://127.0.0.1:${multipleCountersV3DebugLoginLoopbackPort.toString()}`,
        rewrite: path => path.replace(/^\/__foldkit-debug/, ''),
      },
    },
  },
})
