import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const instance=createHash('sha256').update(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..').toLowerCase()).digest('hex').slice(0,16);
export default defineConfig({
  plugins: [react(), tailwindcss(), {name:'helpdesk-dev-identity',configureServer(server){server.middlewares.use('/__helpdesk_dev',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({instance}));});}}],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT??3000}`, changeOrigin: false }, '/socket.io':{target:`http://127.0.0.1:${process.env.PORT??3000}`,ws:true} },
  },
});
