/**
 * Parses semver string into [major, minor, patch] numeric tuple.
 */
export function parseSemver(v: string): [number, number, number] {
  const clean = v.trim().replace(/^v/i, '').trim()
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/**
 * Returns true if remoteVersion is strictly newer than currentVersion.
 */
export function isNewerVersion(
  remoteVersion: string,
  currentVersion: string,
): boolean {
  const [rMaj, rMin, rPat] = parseSemver(remoteVersion)
  const [cMaj, cMin, cPat] = parseSemver(currentVersion)

  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPat > cPat
}
