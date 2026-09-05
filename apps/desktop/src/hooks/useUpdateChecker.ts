import { useCallback, useEffect, useState } from 'react'
import { openExternalUrl } from '../lib/api'

export const APP_VERSION = '0.3.0'
export const GITHUB_REPO = 'Kingof3O/laap'
const DISMISSED_KEY = 'laap_dismissed_update_version'

export interface GitHubReleaseInfo {
  tagName: string
  version: string
  name: string
  body: string
  htmlUrl: string
  publishedAt: string
}

/**
 * Parses semver string into [major, minor, patch] numeric tuple.
 */
function parseSemver(v: string): [number, number, number] {
  const clean = v.replace(/^v/, '').trim()
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/**
 * Returns true if remoteVersion is strictly newer than currentVersion.
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  const [rMaj, rMin, rPat] = parseSemver(remoteVersion)
  const [cMaj, cMin, cPat] = parseSemver(currentVersion)

  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPat > cPat
}

export function useUpdateChecker() {
  const [checking, setChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [latestRelease, setLatestRelease] = useState<GitHubReleaseInfo | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const checkForUpdates = useCallback(async (manual = false) => {
    setChecking(true)
    setCheckError(null)

    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!res.ok) {
        if (res.status === 404) {
          // No releases published yet on repo
          setUpdateAvailable(false)
          return null
        }
        throw new Error(`GitHub API error (${res.status})`)
      }

      const data = (await res.json()) as {
        tag_name?: string
        name?: string
        body?: string
        html_url?: string
        published_at?: string
      }

      if (!data.tag_name) {
        setUpdateAvailable(false)
        return null
      }

      const releaseVersion = data.tag_name.replace(/^v/, '')
      const releaseInfo: GitHubReleaseInfo = {
        tagName: data.tag_name,
        version: releaseVersion,
        name: data.name || `Release ${data.tag_name}`,
        body: data.body || 'New enhancements and updates are available.',
        htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
        publishedAt: data.published_at || new Date().toISOString(),
      }

      setLatestRelease(releaseInfo)

      const isNew = isNewerVersion(releaseVersion, APP_VERSION)
      const dismissed = localStorage.getItem(DISMISSED_KEY)

      if (isNew) {
        // If manual check, always show even if previously dismissed
        if (manual || dismissed !== releaseVersion) {
          setUpdateAvailable(true)
        } else {
          setUpdateAvailable(false)
        }
      } else {
        setUpdateAvailable(false)
      }

      return releaseInfo
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause)
      setCheckError(msg)
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  // Check on startup automatically
  useEffect(() => {
    void checkForUpdates(false)
  }, [checkForUpdates])

  const dismissUpdate = useCallback((forever = false) => {
    if (forever && latestRelease) {
      localStorage.setItem(DISMISSED_KEY, latestRelease.version)
    }
    setUpdateAvailable(false)
  }, [latestRelease])

  const openReleasePage = useCallback(() => {
    const url = latestRelease?.htmlUrl || `https://github.com/${GITHUB_REPO}/releases/latest`
    void openExternalUrl(url)
  }, [latestRelease])

  return {
    currentVersion: APP_VERSION,
    checking,
    updateAvailable,
    latestRelease,
    checkError,
    checkForUpdates,
    dismissUpdate,
    openReleasePage,
  }
}
