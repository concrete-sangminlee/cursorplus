const TAG_FIELD_SEPARATOR = '\x1f'

export const GIT_TAG_FORMAT = [
  '%(refname:short)',
  '%(objectname:short)',
  '%(*objectname:short)',
  '%(creatordate:iso)',
  '%(objecttype)',
  '%(subject)',
  '%(taggername)',
  '%(taggeremail)',
].join(TAG_FIELD_SEPARATOR)

export interface GitTagPayload {
  name: string
  hash: string
  targetHash?: string
  message: string
  tagger?: string
  taggerEmail?: string
  date: string
  isAnnotated: boolean
}

export function parseGitTagLine(line: string): GitTagPayload {
  const [
    name = '',
    hash = '',
    targetHash = '',
    date = '',
    objectType = '',
    subject = '',
    tagger = '',
    taggerEmail = '',
  ] = line.split(TAG_FIELD_SEPARATOR)
  const isAnnotated = objectType === 'tag'

  return {
    name,
    hash,
    targetHash: targetHash || undefined,
    message: isAnnotated ? subject : '',
    tagger: tagger || undefined,
    taggerEmail: taggerEmail ? taggerEmail.replace(/^<|>$/g, '') : undefined,
    date,
    isAnnotated,
  }
}
