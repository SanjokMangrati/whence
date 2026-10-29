import { MousePointer2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { EASE_IN_OUT, ease } from './motion'
import { HEIGHT, WIDTH } from './timeline'
import { Icon } from '@/components/icon'

const APP_WIDTH = 1280
const APP_HEIGHT = 800
const FIT = 1.28

const ZOOM = 1.4
const ROOM = 0.86
const REACH_X = 1400
const REACH_Y = 840
const PAD = 8

const SLIDE = 48

type Point = [number, number]
type Rect = [number, number, number, number]

export interface Move {
  at: number
  on: string
  dx?: number
  dy?: number
  leave?: boolean
}

export interface Focus {
  at: number
  on: string | null
}

type Enter = 'tilt' | 'fade' | 'slide'
type Exit = 'slide' | 'fade' | 'drop'

function box(node: HTMLElement, root: HTMLElement): Rect {
  let x = 0
  let y = 0
  let at: HTMLElement | null = node
  while (at !== null && at !== root) {
    x += at.offsetLeft
    y += at.offsetTop
    at = at.offsetParent as HTMLElement | null
  }
  return [x, y, node.offsetWidth, node.offsetHeight]
}

function track<T extends { at: number }>(keys: T[], frame: number, value: (key: T) => number[]) {
  const next = keys.findIndex((key) => key.at > frame)
  if (next === -1) return value(keys.at(-1)!)
  if (next === 0) return value(keys[0]!)
  const from = keys[next - 1]!
  const to = keys[next]!
  const a = value(from)
  const b = value(to)
  return a.map((start, index) => ease(frame, [from.at, to.at], [start, b[index]!], EASE_IN_OUT))
}

function place(points: Record<string, Point>, key: Move) {
  const [x, y] = points[key.on] ?? [APP_WIDTH / 2, APP_HEIGHT / 2]
  return [x + (key.dx ?? 0), y + (key.dy ?? 0)]
}

function fit(rect: Rect) {
  const [, , w, h] = rect
  const room = Math.min((WIDTH * ROOM) / (w * FIT), (HEIGHT * ROOM) / (h * FIT))
  return Math.min(ZOOM, Math.max(1, room))
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a[0], b[0])
  const y = Math.min(a[1], b[1])
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y]
}

const WHOLE: Rect = [0, 0, APP_WIDTH, APP_HEIGHT]

function look(parts: Record<string, Rect>, keys: Focus[], frame: number) {
  const next = keys.findIndex((key) => key.at > frame)
  const from = next === -1 ? keys.at(-1)! : keys[Math.max(0, next - 1)]!
  const to = next <= 0 ? from : keys[next]!
  const a = from.on === null ? undefined : parts[from.on]
  const b = to.on === null ? undefined : parts[to.on]
  const hole = (rect: Rect | undefined, weight: number) => {
    if (rect === undefined || weight === 0) return []
    const [x, y, w, h] = rect
    const padded: Rect = [x - PAD, y - PAD, w + PAD * 2, h + PAD * 2]
    return [{ rect: padded, weight }]
  }
  const centre = (rect: Rect): Point => [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2]
  const move = from === to ? 0 : ease(frame, [from.at, to.at], [0, 1], EASE_IN_OUT)
  const [ax, ay] = centre(a ?? WHOLE)
  const [bx, by] = centre(b ?? WHOLE)
  const za = a === undefined ? 1 : fit(a)
  const zb = b === undefined ? 1 : fit(b)
  const camera = {
    cx: ax + (bx - ax) * move,
    cy: ay + (by - ay) * move,
    zoom: za + (zb - za) * move,
  }
  if (a === undefined && b === undefined) return { ...camera, veil: 0, holes: [] }
  if (a === undefined) return { ...camera, veil: Math.min(1, move * 2.5), holes: hole(b, 1) }
  if (b === undefined) return { ...camera, veil: Math.min(1, (1 - move) * 2.5), holes: hole(a, 1) }
  if (from.on === to.on) return { ...camera, veil: 1, holes: hole(a, 1) }
  const dip = Math.max(0, (za + zb) / 2 - fit(union(a, b)))
  return {
    ...camera,
    zoom: camera.zoom - dip * Math.sin(Math.PI * move),
    veil: 1,
    holes: [...hole(a, 1 - move), ...hole(b, move)],
  }
}

function entrance(enter: Enter, frame: number) {
  switch (enter) {
    case 'tilt':
      return {
        opacity: ease(frame, [0, 12], [0, 1]),
        rotate: ease(frame, [0, 40], [10, 0]),
        shift: [0, ease(frame, [0, 40], [80, 0])],
        scale: ease(frame, [0, 40], [0.96, 1]),
        blur: ease(frame, [0, 16], [3, 0]),
      }
    case 'fade':
      return {
        opacity: ease(frame, [0, 14], [0, 1]),
        rotate: 0,
        shift: [0, 0],
        scale: ease(frame, [0, 18], [0.98, 1]),
        blur: 0,
      }
    case 'slide':
      return {
        opacity: ease(frame, [0, 14], [0, 1]),
        rotate: 0,
        shift: [ease(frame, [0, 18], [SLIDE, 0]), 0],
        scale: 1,
        blur: 0,
      }
  }
}

function departure(exit: Exit, frame: number, end: number) {
  switch (exit) {
    case 'slide':
      return {
        opacity: ease(frame, [end - 12, end], [1, 0]),
        shift: [ease(frame, [end - 12, end], [0, -SLIDE], EASE_IN_OUT), 0],
        scale: 1,
        blur: 0,
      }
    case 'fade':
      return {
        opacity: ease(frame, [end - 10, end], [1, 0]),
        shift: [0, 0],
        scale: ease(frame, [end - 10, end], [1, 1.02], EASE_IN_OUT),
        blur: 0,
      }
    case 'drop':
      return {
        opacity: ease(frame, [end - 18, end], [1, 0]),
        shift: [0, ease(frame, [end - 18, end], [0, 30], EASE_IN_OUT)],
        scale: ease(frame, [end - 18, end], [1, 0.96], EASE_IN_OUT),
        blur: 0,
      }
  }
}

function Pointer({
  points,
  moves,
  clicks,
}: {
  points: Record<string, Point>
  moves: Move[]
  clicks: number[]
}) {
  const frame = useCurrentFrame()
  const [x, y] = track(moves, frame, (key) => place(points, key))
  let opacity = ease(frame, [moves[0]!.at - 10, moves[0]!.at - 4], [0, 1])
  moves.forEach((key, index) => {
    if (key.leave !== true) return
    const next = moves[index + 1]
    const out = ease(frame, [key.at + 2, key.at + 8], [0, 1])
    const back = next === undefined ? 0 : ease(frame, [next.at - 12, next.at - 4], [0, 1])
    opacity *= 1 - out * (1 - back)
  })
  const press = clicks.some((click) => frame >= click - 2 && frame < click + 3)
  return (
    <>
      {clicks.map((click) => {
        if (frame < click || frame > click + 18) return null
        const size = ease(frame, [click, click + 18], [10, 48])
        return (
          <span
            key={click}
            className="pointer-events-none absolute z-10 rounded-full border-2 border-card outline-1 outline-ink"
            style={{
              left: x! - size / 2,
              top: y! - size / 2,
              width: size,
              height: size,
              opacity: ease(frame, [click, click + 18], [0.3, 0]),
            }}
          />
        )
      })}
      <span
        className="pointer-events-none absolute z-10"
        style={{
          left: x! - 4,
          top: y! - 3,
          opacity,
          scale: press ? 0.86 : 1,
          transformOrigin: '4px 3px',
        }}
      >
        <Icon icon={MousePointer2} size={22} className="fill-card text-ink" />
      </span>
    </>
  )
}

export function Shot({
  duration,
  enter,
  exit,
  pointer,
  clicks = [],
  focus = [{ at: 0, on: null }],
  children,
}: {
  duration: number
  enter: Enter
  exit: Exit
  pointer?: Move[]
  clicks?: number[]
  focus?: Focus[]
  children: ReactNode
}) {
  const frame = useCurrentFrame()
  const root = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Record<string, Point>>({})
  const [parts, setParts] = useState<Record<string, Rect>>({})

  useLayoutEffect(() => {
    function measure() {
      const current = root.current
      if (current === null) return
      const anchors: Record<string, Point> = {}
      for (const node of current.querySelectorAll<HTMLElement>('[data-anchor]')) {
        const [x, y, w, h] = box(node, current)
        anchors[node.dataset.anchor!] = [x + w / 2, y + h / 2]
      }
      const measured: Record<string, Rect> = {}
      for (const node of current.querySelectorAll<HTMLElement>('[data-focus]')) {
        measured[node.dataset.focus!] = box(node, current)
      }
      setPoints(anchors)
      setParts(measured)
    }
    measure()
  }, [frame])

  const into = entrance(enter, frame)
  const out = departure(exit, frame, duration)
  const { cx, cy, zoom, veil, holes } = look(parts, focus, frame)
  const scale = FIT * zoom
  const at = {
    width: APP_WIDTH,
    height: APP_HEIGHT,
    translate: `${WIDTH / 2 - cx * scale}px ${HEIGHT / 2 - cy * scale}px`,
    scale,
  }

  return (
    <AbsoluteFill style={{ perspective: 2400 }}>
      <AbsoluteFill
        style={{
          opacity: into.opacity * out.opacity,
          rotate: `x ${into.rotate}deg`,
          translate: `${into.shift[0]! + out.shift[0]!}px ${into.shift[1]! + out.shift[1]!}px`,
          scale: into.scale * out.scale,
          filter: `blur(${into.blur + out.blur}px)`,
        }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left overflow-hidden rounded-lg bg-paper-grain text-ink shadow-float"
          style={at}
        >
          <div ref={root} className="relative h-full w-full">
            {children}
          </div>
        </div>
        <div className="absolute top-0 left-0 origin-top-left" style={at}>
          {veil > 0 && (
            <div
              className="pointer-events-none absolute bg-paper-grain"
              style={{
                left: -REACH_X,
                top: -REACH_Y,
                width: APP_WIDTH + REACH_X * 2,
                height: APP_HEIGHT + REACH_Y * 2,
                opacity: veil,
                maskImage: [
                  ...holes.map(
                    ({ weight }) =>
                      `linear-gradient(color-mix(in srgb, var(--color-ink) ${weight * 100}%, transparent) 0 0)`,
                  ),
                  'linear-gradient(var(--color-ink) 0 0)',
                ].join(','),
                maskSize: [
                  ...holes.map(({ rect }) => `${rect[2]}px ${rect[3]}px`),
                  '100% 100%',
                ].join(','),
                maskPosition: [
                  ...holes.map(({ rect }) => `${rect[0] + REACH_X}px ${rect[1] + REACH_Y}px`),
                  '0 0',
                ].join(','),
                maskRepeat: 'no-repeat',
                maskComposite: 'exclude',
              }}
            />
          )}
          {pointer !== undefined && <Pointer points={points} moves={pointer} clicks={clicks} />}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
