<template>
  <!-- eslint-disable-next-line vue/no-v-html is safe here because all HTML is sanitized with DOMPurify in setup() -->
  <div v-html="value" />
</template>

<script lang="ts">
import { marked } from "marked";
import { sanitizeMarkdownHtml } from "~/lib/sanitize/markdown";

// Module-level parse cache: marked + DOMPurify per instance is the dominant cost of mounting a
// recipe page (every step, note, and description flows through here), and the same source
// strings recur — the description renders in two layouts, the print duplicate re-renders every
// step, and revisiting a recipe re-parses everything. Keyed by source alone: the only other
// input, allowedIframeHosts, is constant for the life of the app.
const PARSE_CACHE_MAX = 500;
const parseCache = new Map<string, string>();
</script>

<script setup lang="ts">
const props = defineProps({
  source: {
    type: String,
    default: "",
  },
});

const { $appInfo } = useNuxtApp();

const value = computed(() => {
  const source = props.source || "";
  const cached = parseCache.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const rawHtml = marked.parse(source, { async: false, breaks: true });
  const html = sanitizeMarkdownHtml(rawHtml, $appInfo?.allowedIframeHosts ?? []);
  if (parseCache.size >= PARSE_CACHE_MAX) {
    // Map iterates in insertion order — evict the oldest half rather than tracking true LRU.
    let drop = PARSE_CACHE_MAX / 2;
    for (const key of parseCache.keys()) {
      if (drop-- <= 0) break;
      parseCache.delete(key);
    }
  }
  parseCache.set(source, html);
  return html;
});
</script>

<style scoped>
:deep(table) {
  border-collapse: collapse;
  width: 100%;
}

:deep(th),
:deep(td) {
  border: 1px solid;
  padding: 8px;
  text-align: left;
}

:deep(th) {
  font-weight: bold;
}

:deep(ul),
:deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}
</style>
