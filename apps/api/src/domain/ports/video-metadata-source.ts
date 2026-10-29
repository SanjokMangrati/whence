export interface VideoMetadata {
  title: string | null
  channel: string | null
  lengthMs: number
}

export interface VideoMetadataSource {
  lookup(url: string): Promise<VideoMetadata>
}
