// Fork: gives every category/tag a stable, food-appropriate hue so tags read as
// colored identity instead of a wall of grey pills. The hue is derived from the
// name, so the same tag is always the same color without any manual mapping.
// Tuned to sit well on both the warm-dark and warm-light editorial themes when used
// as a small dot + low-opacity tinted pill (text stays the theme's normal color).

const TAG_HUES = [
  "#E4A93C", // amber
  "#DB8570", // rose
  "#93B074", // sage
  "#8AA4B8", // slate
  "#C69AD6", // plum
  "#6FB3A8", // teal
  "#C98A5E", // clay
  "#D98BA0", // blush
] as const;

export function tagHue(name?: string | null): string {
  const key = (name || "").trim().toLowerCase();
  if (!key) {
    return TAG_HUES[0]!;
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TAG_HUES[hash % TAG_HUES.length]!;
}
