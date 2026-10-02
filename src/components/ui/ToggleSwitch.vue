<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string; hideLabel?: boolean }>()
// The parent decides whether the change is allowed, so this stays controlled:
// the checkbox is reset to the prop value until the parent updates it.
const emit = defineEmits<{ change: [value: boolean] }>()

function onChange(e: Event, current: boolean) {
  const input = e.target as HTMLInputElement
  const wanted = input.checked
  input.checked = current
  emit('change', wanted)
}
</script>

<template>
  <label class="inline-flex min-h-11 items-center gap-2.5 text-sm select-none">
    <span class="relative inline-flex">
      <input
        type="checkbox"
        role="switch"
        class="peer sr-only"
        :checked="modelValue"
        :aria-label="hideLabel ? label : undefined"
        @change="onChange($event, modelValue)"
      />
      <span
        class="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
      />
      <span
        class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
      />
    </span>
    <span v-if="!hideLabel" class="text-muted">{{ label }}</span>
  </label>
</template>
