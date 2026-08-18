<template>
  <!-- Quick fractional scaling: ¼ ½ 1× 2×. Exists because every ingredient in this library
       is an unparsed text note, so upstream's servings stepper (RecipeScaleEditButton) is
       inert here — its edit affordance needs linked foods/units. One tap scales every
       ingredient line (leading-token text scaling, see use-note-scaler); tapping 1× resets.
       `mandatory` keeps exactly one chip active, so the control doubles as the indicator. -->
  <div class="fork-scale">
    <!-- Literal, like the fork's other UI strings ("Rate", "Add to cookbook") — no
         upstream i18n key exists for this control. -->
    <span class="fork-scale__label">Scale</span>
    <v-chip-group
      :model-value="modelValue"
      mandatory
      class="fork-scale__chips"
      selected-class="fork-scale-chip--active"
      @update:model-value="onSelect"
    >
      <v-chip
        v-for="option in OPTIONS"
        :key="option.value"
        :value="option.value"
        size="small"
        variant="outlined"
        class="fork-scale-chip"
        :aria-label="`Scale recipe to ${option.aria}`"
      >
        {{ option.label }}
      </v-chip>
    </v-chip-group>
  </div>
</template>

<script setup lang="ts">
const modelValue = defineModel<number>({ default: 1 });

const OPTIONS = [
  { value: 0.25, label: "¼", aria: "one quarter" },
  { value: 0.5, label: "½", aria: "one half" },
  { value: 1, label: "1×", aria: "full recipe" },
  { value: 2, label: "2×", aria: "double" },
] as const;

function onSelect(value: unknown) {
  // `mandatory` means deselection never fires, but guard anyway: only known scales pass.
  if (typeof value === "number" && OPTIONS.some(option => option.value === value)) {
    modelValue.value = value;
  }
}
</script>

<style lang="scss" scoped>
.fork-scale {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.fork-scale__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.55;
}

/* Chip family styling: quiet outline at rest, the gold accent (the rating precedent) when
   active. Fixed min-width per chip so amounts changing never reflows the row. */
.fork-scale-chip {
  min-width: 40px;
  justify-content: center;
  font-weight: 600;
}

.fork-scale-chip--active {
  color: #b28704;
  border-color: #ffb300;
  background: rgba(255, 179, 0, 0.12);
}
</style>
