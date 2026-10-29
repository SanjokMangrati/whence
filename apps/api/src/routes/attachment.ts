export function attachment(filename: string): string {
  const plain = filename.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', "'")
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
