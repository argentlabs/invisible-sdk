import path from "path"
import process from "process"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

export default defineConfig({
  define: {
    "process.env": {},
    process: process,
  },
  resolve: {
    alias: {
      process: "process/browser",
    },
  },
  esbuild: {
    drop: [], // This keeps all console.* statements
    pure: [], // This ensures no functions are marked as pure (which could lead to them being dropped)
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "@argent/invisible-sdk",
      fileName: (format) => `index.${format}.js`,
    },
    minify: "esbuild",
    rollupOptions: {
      // Externalize deps that shouldn't be bundled into your library
      external: [], // Add any external dependencies here
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          // Add any global variables for external dependencies here
        },
      },
    },
  },
  plugins: [
    dts({
      entryRoot: path.resolve(__dirname, "src"),
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
})
