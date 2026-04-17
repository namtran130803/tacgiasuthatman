import { computed, onBeforeUnmount, ref } from 'vue'

export interface SeekSliderOptions {
  min?: number
  max: () => number
  value: () => number
  onSeek: (value: number) => void
}

export function useSeekSlider(options: SeekSliderOptions) {
  const trackRef = ref<HTMLElement | null>(null)
  const isDragging = ref(false)
  const dragValue = ref<number | null>(null)

  const min = options.min ?? 0

  function clamp(value: number, lower: number, upper: number) {
    return Math.min(Math.max(value, lower), upper)
  }

  function resolveCurrentValue() {
    return dragValue.value ?? options.value()
  }

  const previewValue = computed(() => resolveCurrentValue())

  const progress = computed(() => {
    const max = options.max()
    if (!max || max <= min) {
      return 0
    }

    return clamp(((resolveCurrentValue() - min) / (max - min)) * 100, 0, 100)
  })

  function seekFromClientX(clientX: number) {
    const element = trackRef.value
    if (!element) {
      return
    }

    const rect = element.getBoundingClientRect()
    if (!rect.width) {
      return
    }

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    const nextValue = min + (options.max() - min) * ratio
    dragValue.value = nextValue
  }

  function commitCurrentValue() {
    if (dragValue.value === null) {
      return
    }

    options.onSeek(dragValue.value)
  }

  function onPointerDown(event: PointerEvent) {
    if (!trackRef.value) {
      return
    }

    event.preventDefault()
    isDragging.value = true
    trackRef.value.setPointerCapture?.(event.pointerId)
    seekFromClientX(event.clientX)
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging.value) {
      return
    }

    seekFromClientX(event.clientX)
  }

  function stopDragging() {
    if (!isDragging.value) {
      return
    }

    commitCurrentValue()
    isDragging.value = false
    dragValue.value = null
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDragging)
  window.addEventListener('pointercancel', stopDragging)

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', stopDragging)
    window.removeEventListener('pointercancel', stopDragging)
  })

  return {
    trackRef,
    isDragging,
    previewValue,
    progress,
    onPointerDown,
    onPointerMove,
    stopDragging,
  }
}
