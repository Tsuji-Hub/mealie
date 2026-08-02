import { config } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

function loadEnLocales() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../lang/messages/en-US.json") as Record<string, string>;
}

const i18n = createI18n({
  locale: "en-US",
  messages: {
    "en-US": loadEnLocales(),
  },
});

config.global.plugins = [...(config.global.plugins ?? []), i18n];

// jsdom has no ResizeObserver; Vuetify overlays observe their activator's size.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom has no visualViewport; Vuetify's overlay positioning (v-menu, v-dialog) requires it.
// Minimal stub so components that open overlays can be mounted in tests.
if (typeof window !== "undefined" && !window.visualViewport) {
  const stub = {
    width: 1280,
    height: 800,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, "visualViewport", { value: stub, configurable: true });
}

export { i18n };
