export function sourceTextKey(sourceId: string) {
  return `sources/${sourceId}.txt`
}

export function jobStepKey(jobId: string, step: string) {
  return `jobs/${jobId}/${step}.json`
}

export async function putText(bucket: R2Bucket, key: string, body: string) {
  await bucket.put(key, body)
}

export async function getText(bucket: R2Bucket, key: string): Promise<string> {
  const object = await bucket.get(key)
  if (object === null) {
    throw new Error(`R2 object ${key} is missing.`)
  }
  return object.text()
}

export async function putJson(bucket: R2Bucket, key: string, value: unknown) {
  await bucket.put(key, JSON.stringify(value))
}

export async function findJson<T>(bucket: R2Bucket, key: string): Promise<T | undefined> {
  const object = await bucket.get(key)
  return object === null ? undefined : ((await object.json()) as T)
}
