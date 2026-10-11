import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    build: { outDir: "dist", emptyOutDir: true },
    server: { proxy: { "/v2": process.env.SDC_API_ORIGIN ?? "http://127.0.0.1:8765" } }
});
