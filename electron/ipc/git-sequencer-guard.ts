export type GitSequencerOptions = {
  noCommit?: boolean
  mainline?: number
}

export function appendGitSequencerOptions(args: string[], options?: GitSequencerOptions): void {
  if (options?.noCommit) {
    args.push('--no-commit')
  }

  if (options?.mainline !== undefined) {
    if (!Number.isInteger(options.mainline) || options.mainline < 1) {
      throw new Error('Invalid mainline parent number')
    }
    args.push('-m', String(options.mainline))
  }
}
