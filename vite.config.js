import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // sockjs-client 는 Node.js global 을 참조하므로 브라우저 환경에 폴리필
    global: 'globalThis',
  },
})
