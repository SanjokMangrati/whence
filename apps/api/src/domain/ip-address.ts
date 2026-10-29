const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

const PRIVATE_V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

export function isIpLiteral(host: string): boolean {
  return IPV4.test(host) || host.includes(':')
}

export function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    return isPrivateV6(address)
  }
  const value = toV4Number(address)
  if (value === null) {
    return true
  }
  return PRIVATE_V4_BLOCKS.some(([start, prefix]) => inBlock(value, start, prefix))
}

function inBlock(value: number, start: string, prefix: number): boolean {
  const mask = (-1 << (32 - prefix)) >>> 0
  return (value & mask) >>> 0 === (toV4Number(start)! & mask) >>> 0
}

function toV4Number(address: string): number | null {
  const match = IPV4.exec(address)
  if (match === null) {
    return null
  }
  let value = 0
  for (const group of match.slice(1)) {
    const octet = Number(group)
    if (octet > 255) {
      return null
    }
    value = (value * 256 + octet) >>> 0
  }
  return value
}

function isPrivateV6(address: string): boolean {
  const groups = expandV6(address.toLowerCase())
  if (groups === null) {
    return true
  }

  if (groups.slice(0, 5).every((group) => group === 0) && [0, 0xffff].includes(groups[5]!)) {
    const [high, low] = [groups[6]!, groups[7]!]
    return isPrivateAddress([high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'))
  }

  const first = groups[0]!
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

function expandV6(address: string): number[] | null {
  let text = address.split('%')[0]!
  if (text.includes('.')) {
    const cut = text.lastIndexOf(':')
    const value = toV4Number(text.slice(cut + 1))
    if (value === null) {
      return null
    }
    text = `${text.slice(0, cut + 1)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
  }

  const halves = text.split('::')
  if (halves.length > 2) {
    return null
  }
  const left = halves[0] === '' ? [] : halves[0]!.split(':')
  const right = halves.length < 2 || halves[1] === '' ? [] : halves[1]!.split(':')
  const parsed = [...left, ...right].map((group) => Number.parseInt(group, 16))
  if (parsed.some((group) => Number.isNaN(group) || group > 0xffff)) {
    return null
  }

  const groups =
    halves.length === 2
      ? [
          ...parsed.slice(0, left.length),
          ...Array<number>(8 - parsed.length).fill(0),
          ...parsed.slice(left.length),
        ]
      : parsed
  return groups.length === 8 ? groups : null
}
