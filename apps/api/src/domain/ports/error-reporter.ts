export interface ErrorContext {
  where: string
  userId?: string
  properties?: Record<string, string>
}

export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): Promise<void>
}
