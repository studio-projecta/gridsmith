import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  // imagequant 는 wasm-bindgen bundler 타겟(.wasm 을 직접 import)이라 wasm 플러그인이 필요하고,
  // 그 초기화가 top-level await 를 쓰므로 topLevelAwait 도 함께 둔다.
  plugins: [wasm(), topLevelAwait(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // 프리번들하면 import.meta.url 이 .vite/deps 를 가리켜 codec 옆의 .wasm 을
  // 못 찾고 SPA fallback(HTML) 이 응답된다. 제외해 실제 node_modules 경로로 로드.
  optimizeDeps: {
    exclude: ['@jsquash/oxipng'],
  },
})
