import { Easing, interpolate } from 'remotion'

export const EASE_OUT = Easing.bezier(0.2, 0.7, 0.2, 1)
export const EASE_IN_OUT = Easing.bezier(0.6, 0, 0.3, 1)

export function ease(frame: number, input: number[], output: number[], easing = EASE_OUT) {
  return interpolate(frame, input, output, {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

export function typed(text: string, frame: number, start: number, end: number): string {
  return text.slice(0, Math.round(ease(frame, [start, end], [0, text.length])))
}

export function rise(frame: number, start: number) {
  return {
    opacity: ease(frame, [start, start + 10], [0, 1]),
    translate: `0 ${ease(frame, [start, start + 10], [6, 0])}px`,
  }
}

export function sweepStyle(scope: string, frame: number, start: number): string {
  const share = ease(frame, [start, start + 10], [0, 100])
  return `.${scope} .highlight[data-lit]{background-size:${share}% 1px,${share}% 100%}`
}
