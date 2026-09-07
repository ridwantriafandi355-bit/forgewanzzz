import path from 'node:path';

export class WorkspaceJail {
  public static resolveSafePath(targetRelOrAbsPath: string, workspacePath: string): string {
    const normalizedWorkspace = path.resolve(workspacePath);
    let resolvedTarget: string;

    if (path.isAbsolute(targetRelOrAbsPath)) {
      resolvedTarget = path.normalize(targetRelOrAbsPath);
    } else {
      resolvedTarget = path.resolve(normalizedWorkspace, targetRelOrAbsPath);
    }

    // Ensure resolved path starts with the normalized workspace directory
    // Use lowercased comparison on Windows for case-insensitivity
    const isWindows = process.platform === 'win32';
    const compTarget = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const compWs = isWindows ? normalizedWorkspace.toLowerCase() : normalizedWorkspace;

    if (!compTarget.startsWith(compWs)) {
      throw new Error(
        `Path traversal detected: '${targetRelOrAbsPath}' escapes authorized workspace root '${workspacePath}'`
      );
    }

    return resolvedTarget;
  }
}
