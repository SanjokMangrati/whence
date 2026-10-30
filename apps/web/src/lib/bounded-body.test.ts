import { describe, expect, it } from 'vitest'
import { readWithin } from './bounded-body'

function streamOf(...sizes: number[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of sizes) controller.enqueue(new Uint8Array(size).fill(1))
      controller.close()
    },
  })
}

describe('readWithin', () => {
  it('joins the chunks of a body within the limit', async () => {
    const body = await readWithin(streamOf(3, 4, 3), 10)
    expect(body).toEqual(new Uint8Array(10).fill(1))
  })

  it('refuses a body one byte over the limit', async () => {
    expect(await readWithin(streamOf(6, 5), 10)).toBeNull()
  })

  it('reads an empty body as zero bytes', async () => {
    expect(await readWithin(streamOf(), 10)).toEqual(new Uint8Array(0))
  })
})
