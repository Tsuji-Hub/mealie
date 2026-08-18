<template>
  <!-- .stop everywhere: the step card's own click toggles step-checked, and starting a
       timer must never check the step off. -->
  <div v-if="chips.length" class="fork-timers d-print-none" @click.stop>
    <button
      v-for="chip in chips"
      :key="chip.index"
      type="button"
      class="fork-timer-chip"
      :class="{
        'fork-timer-chip--running': chip.timer?.state === 'running',
        'fork-timer-chip--paused': chip.timer?.state === 'paused',
        'fork-timer-chip--done': chip.timer?.state === 'done',
      }"
      :aria-label="chipAria(chip)"
      @click.stop="onTap(chip)"
    >
      <v-icon size="14" class="mr-1">
        {{ chip.timer?.state === 'done' ? $globals.icons.alert : $globals.icons.clockOutline }}
      </v-icon>
      <span>{{ chipText(chip) }}</span>
      <v-icon
        v-if="chip.timer"
        size="14"
        class="ml-1"
        :aria-label="`Cancel timer for ${chip.duration.label}`"
        @click.stop="cancelTimer(chip.timer.id)"
      >
        {{ $globals.icons.close }}
      </v-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { StepDuration, StepTimer } from "~/composables/recipes/use-step-timers";
import { findStepDurations, formatClock, finishedAgo, remainingMs, useStepTimers } from "~/composables/recipes/use-step-timers";

const props = defineProps<{
  stepText: string;
  stepIndex: number;
  slug: string;
}>();

const { now, startTimer, togglePause, cancelTimer, timerFor } = useStepTimers();

// Parsed once per text change (computed), never per tick — `now` is not a dependency here.
const durations = computed(() => findStepDurations(props.stepText));

interface Chip {
  index: number;
  duration: StepDuration;
  timer: StepTimer | undefined;
}

const chips = computed<Chip[]>(() =>
  durations.value.map((duration, index) => ({
    index,
    duration,
    timer: timerFor(props.slug, props.stepIndex, index),
  })),
);

function onTap(chip: Chip) {
  if (!chip.timer) {
    startTimer(props.slug, props.stepIndex, chip.index, chip.duration);
  }
  else if (chip.timer.state === "done") {
    cancelTimer(chip.timer.id);
  }
  else {
    togglePause(chip.timer.id);
  }
}

function chipText(chip: Chip): string {
  if (!chip.timer) {
    return chip.duration.label;
  }
  if (chip.timer.state === "done") {
    return `Done · ${finishedAgo(chip.timer, now.value)}`;
  }
  const clock = formatClock(remainingMs(chip.timer, now.value));
  return chip.timer.state === "paused" ? `${clock} · paused` : clock;
}

function chipAria(chip: Chip): string {
  if (!chip.timer) {
    return `Start a ${chip.duration.label} timer`;
  }
  if (chip.timer.state === "done") {
    return "Timer finished — tap to dismiss";
  }
  return chip.timer.state === "paused" ? "Resume timer" : "Pause timer";
}
</script>

<style lang="scss" scoped>
.fork-timers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.fork-timer-chip {
  display: inline-flex;
  align-items: center;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.45);
  opacity: 0.85;
  cursor: pointer;
  appearance: none;
  background: transparent;
  color: inherit;
}

.fork-timer-chip--running {
  border-color: #ffb300;
  color: #b28704;
  background: rgba(255, 179, 0, 0.1);
  opacity: 1;
  font-variant-numeric: tabular-nums;
}

.fork-timer-chip--paused {
  border-style: dashed;
  font-variant-numeric: tabular-nums;
}

.fork-timer-chip--done {
  border-color: #ffb300;
  color: #b28704;
  background: rgba(255, 179, 0, 0.18);
  opacity: 1;
  animation: fork-timer-pulse 1.2s ease-in-out infinite;
}

@keyframes fork-timer-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 179, 0, 0.5);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(255, 179, 0, 0);
  }
}
</style>
