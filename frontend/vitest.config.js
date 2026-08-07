import path from "path";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";

export default {
  plugins: [
    vue(),
    AutoImport({
      // vuetify's useDisplay is auto-imported by the nuxt module in the app; mirror it here so
      // components using it bare can be mounted in tests.
      imports: ["vue", "@vueuse/core", "vue-i18n", { vuetify: ["useDisplay"] }],
      dts: false,
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./app/tests/setup.ts"],
    server: {
      deps: {
        // Vuetify ships raw .css imports; without inlining, Node's ESM loader hits them
        // directly and component mount tests cannot import vuetify/components.
        inline: ["vuetify"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["app/{lib,components,composables,layouts,pages}/**/*.{ts,tsx,vue}"],
      exclude: ["**/*.test.*", "node_modules/**", "dist/**", "coverage/**", "**/__tests__/**"],
      reporter: ["html", "text-summary"],
      all: true,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "~": path.resolve(__dirname, "./app"),
      "@@": path.resolve(__dirname, "."),
      "~~": path.resolve(__dirname, "."),
    },
  },
};
