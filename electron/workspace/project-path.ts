let currentProjectPath: string | null = null

export function setProjectPath(projectPath: string) {
  currentProjectPath = projectPath
}

export function getProjectPath(): string | null {
  return currentProjectPath
}
