export interface IpcResult {
  success: boolean
  error?: string
}

type WriteQueueEntry = Promise<void>
const writeQueues = new Map<string, WriteQueueEntry>()

export class IpcOperationError extends Error {
  public readonly operation: string

  constructor(operation: string, message: string) {
    super(message)
    this.operation = operation
    this.name = 'IpcOperationError'
  }
}

function formatIpcError(operation: string, error?: string): string {
  return error || `${operation} failed`
}

export function assertIpcSuccess(result: IpcResult | null | undefined, operation: string): void {
  if (!result || result.success !== true) {
    throw new IpcOperationError(operation, formatIpcError(operation, result?.error))
  }
}

export async function writeFileChecked(
  filePath: string,
  content: string,
  operation = 'Save file',
): Promise<void> {
  const runWrite = async () => {
    const api = (globalThis as { api?: { writeFile?: (filePath: string, content: string) => Promise<IpcResult> } }).api
    if (!api?.writeFile) {
      throw new IpcOperationError(operation, 'IPC API is unavailable')
    }

    const result = await api.writeFile(filePath, content)
    assertIpcSuccess(result, operation)
  }

  const previous = writeQueues.get(filePath) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(() => runWrite())
  const queued = current.catch(() => {}).finally(() => {
    if (writeQueues.get(filePath) === queued) {
      writeQueues.delete(filePath)
    }
  })
  writeQueues.set(filePath, queued)
  await current
}
