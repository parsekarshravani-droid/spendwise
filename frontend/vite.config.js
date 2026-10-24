import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (mode === 'production' && !env.VITE_API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not set. Add it in Netlify > Site configuration > Environment variables, then redeploy.')
  }
  return { plugins: [react()] }
})
