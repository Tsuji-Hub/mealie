<template>
  <!-- Pinned to the bottom of cook mode so a timer from step 2 stays visible while reading
       step 5. Same tap semantics as the step chips: tap = pause/resume, done = dismiss. -->
  <div v-if="slugTimers.length" class="fork-timer-strip d-print-none">
    <button
      v-for="timer in slugTimers"
      :key="timer.id"
      type="button"
      class="fork-timer-strip__item"
      :class="{
        'fork-timer-strip__item--paused': timer.state === 'paused',
        'fork-timer-strip__item--done': timer.state === 'done',
      }"
      @click.stop="onTap(timer)"
    >
      <span class="fork-timer-strip__step">Step {{ timer.stepIndex + 1 }}</span>
      <span class="fork-timer-strip__clock">{{ clockText(timer) }}</span>
      <v-icon
        size="14"
        :aria-label="`Cancel step ${timer.stepIndex + 1} timer`"
        @click.stop="cancelTimer(timer.id)"
      >
        {{ $globals.icons.close }}
      </v-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { StepTimer } from "~/composables/recipes/use-step-timers";
import { finishedAgo, formatClock, remainingMs, useStepTimers } from "~/composables/recipes/use-step-timers";

const props = defineProps<{ slug: string }>();

const { now, togglePause, cancelTimer, timersForSlug } = useStepTimers();
const slugTimers = timersForSlug(props.slug);

function onTap(timer: StepTimer) {
  if (timer.state === "done") {
    cancelTimer(timer.id);
  }
  else {
    togglePause(timer.id);
  }
}

function clockText(timer: StepTimer): string {
  if (timer.state === "done") {
    return `done ${finishedAgo(timer, now.value)}`;
  }
  const clock = formatClock(remainingMs(timer, now.value));
  return timer.state === "paused" ? `${clock} ⏸` : clock;
}
</script>

<style lang="scss" scoped>
.fork-timer-strip {
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  max-width: calc(100vw - 16px);
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(18, 13, 9, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.fork-timer-strip__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #f4efe8;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 179, 0, 0.55);
  background: transparent;
  cursor: pointer;
  appearance: none;
  font-variant-numeric: tabular-nums;
}

.fork-timer-strip__step {
  opacity: 0.75;
  font-weight: 500;
}

.fork-timer-strip__item--paused {
  border-style: dashed;
  opacity: 0.8;
}

.fork-timer-strip__item--done {
  background: rgba(255, 179, 0, 0.25);
  animation: fork-strip-pulse 1.2s ease-in-out infinite;
}

@keyframes fork-strip-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 179, 0, 0.5);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(255, 179, 0, 0);
  }
}
</style>
