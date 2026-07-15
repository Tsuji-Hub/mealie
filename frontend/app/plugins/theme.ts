export interface ThemeConfig {
  lightPrimary: string;
  lightAccent: string;
  lightSecondary: string;
  lightSuccess: string;
  lightInfo: string;
  lightWarning: string;
  lightError: string;
  darkPrimary: string;
  darkAccent: string;
  darkSecondary: string;
  darkSuccess: string;
  darkInfo: string;
  darkWarning: string;
  darkError: string;
}

let __cachedTheme: ThemeConfig | undefined;

// Fork: the backend returns these stock hexes when no THEME_* env var is set, so a
// plain `theme?.x ?? fallback` never falls back. Values matching the stock defaults
// are treated as "not customized" so the editorial palette below applies; any
// genuinely customized THEME_* value differs from stock and still wins.
const BACKEND_STOCK_DEFAULTS: Record<keyof ThemeConfig, string> = {
  lightPrimary: "#E58325",
  lightAccent: "#007A99",
  lightSecondary: "#973542",
  lightSuccess: "#43A047",
  lightInfo: "#1976D2",
  lightWarning: "#FF6D00",
  lightError: "#EF5350",
  darkPrimary: "#E58325",
  darkAccent: "#007A99",
  darkSecondary: "#973542",
  darkSuccess: "#43A047",
  darkInfo: "#1976D2",
  darkWarning: "#FF6D00",
  darkError: "#EF5350",
};

function dropStockDefaults(theme: ThemeConfig | undefined): Partial<ThemeConfig> | undefined {
  if (!theme) {
    return undefined;
  }
  const custom: Partial<ThemeConfig> = {};
  let key: keyof ThemeConfig;
  for (key in BACKEND_STOCK_DEFAULTS) {
    const value = theme[key];
    if (value && value.toUpperCase() !== BACKEND_STOCK_DEFAULTS[key].toUpperCase()) {
      custom[key] = value;
    }
  }
  return custom;
}

async function fetchTheme(): Promise<ThemeConfig | undefined> {
  const route = "/api/app/about/theme";

  try {
    const response = await fetch(route);
    const data = await response.json();
    return data as ThemeConfig;
  }
  catch {
    return undefined;
  }
}

export default defineNuxtPlugin(async (nuxtApp) => {
  nuxtApp.hook("vuetify:before-create", async ({ vuetifyOptions }) => {
    let fetched = __cachedTheme;
    if (!fetched) {
      fetched = await fetchTheme();
      __cachedTheme = fetched;
    }
    const theme = dropStockDefaults(fetched);
    // Fork: "Editorial" theme. Colors AND component defaults live here so the whole
    // app is restyled from this one low-conflict file. THEME_* env vars still win.
    vuetifyOptions.theme = {
      defaultTheme: nuxtApp.$config.public.useDark ? "dark" : "light",
      variations: {
        colors: ["primary", "accent", "secondary", "success", "info", "warning", "error", "background"],
        lighten: 3,
        darken: 3,
      },
      themes: {
        light: {
          dark: false,
          colors: {
            "primary": theme?.lightPrimary ?? "#C2503F",
            "accent": theme?.lightAccent ?? "#F1EBDF",
            "secondary": theme?.lightSecondary ?? "#6E6557",
            "success": theme?.lightSuccess ?? "#4C7A45",
            "info": theme?.lightInfo ?? "#4E6C82",
            "warning": theme?.lightWarning ?? "#B07A1C",
            "error": theme?.lightError ?? "#C0392B",
            "background": "#F6F2EA",
            "surface": "#FFFFFF",
            "on-background": "#241F17",
            "on-surface": "#241F17",
          },
          variables: {
            "border-color": "#E7E0D4",
            "border-opacity": 1,
          },
        },
        // Neutral near-black + true coral. Deliberately NOT warmed/browned: the warmth was
        // leaking into components (the tan #AA9F90 secondary is what produced the
        // tan-square buttons). Keep these values neutral.
        dark: {
          dark: true,
          colors: {
            "primary": theme?.darkPrimary ?? "#E0645A",
            "accent": theme?.darkAccent ?? "#26262B",
            "secondary": theme?.darkSecondary ?? "#8E8E96",
            "success": theme?.darkSuccess ?? "#7FB069",
            "info": theme?.darkInfo ?? "#8AA4B8",
            "warning": theme?.darkWarning ?? "#E4A93C",
            "error": theme?.darkError ?? "#E5695C",
            "background": "#131316",
            "surface": "#1A1A1E",
            "on-background": "#F5F3F0",
            "on-surface": "#F5F3F0",
          },
          variables: {
            "border-color": "#26262B",
            "border-opacity": 1,
          },
        },
      },
    };

    // De-materialize stock Vuetify: flat hairline-bordered cards, larger radii,
    // tonal chips, no ripple. Explicit per-component props always win over these,
    // which is what keeps Save/Delete/Close (variant="elevated") filled and visible.
    vuetifyOptions.defaults = {
      ...vuetifyOptions.defaults,
      global: { ripple: false },
      VCard: { flat: true, border: true, rounded: "lg" },
      VBtn: { rounded: "lg" },
      VChip: { variant: "tonal" },
      VAppBar: { flat: true },
      VToolbar: { flat: true },
    };
  });
});
