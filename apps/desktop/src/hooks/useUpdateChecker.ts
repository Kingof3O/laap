import { useCallback, useEffect, useState } from 'react'
import {
  hasTauri,
  invokeTauri,
  listenTauriEvent,
  openExternalUrl,
} from '../lib/api'
import { flavor } from '../product/flavors'
import { parseSemver, isNewerVersion } from '../lib/version'

export { parseSemver, isNewerVersion }
export const APP_VERSION = '1.0.0'
export const GITHUB_REPO = 'Kingof3O/laap'
const DISMISSED_KEY = 'laap_dismissed_update_version'
const AUTO_CHECK_KEY = 'laap_auto_check_updates'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error'
  | 'up-to-date'

export interface DownloadProgress {
  downloaded: number
  total: number
  percentage: number
}

export interface GitHubReleaseInfo {
  tagName: string
  version: string
  name: string
  body: string
  htmlUrl: string
  publishedAt: string
  downloadUrl?: string | null
  signature?: string | null
  edition?: string
  platform?: string
  isInstallable: boolean
}

interface NativeUpdateResult {
  has_update: boolean
  is_installable?: boolean
  current_version: string
  latest_version: string
  release_name: string
  release_notes: string
  published_at: string
  html_url: string
  download_url?: string | null
  signature?: string | null
  edition: string
  platform: string
}

export function useUpdateChecker() {
  const [currentVersion, setCurrentVersion] = useState<string>(APP_VERSION)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [checking, setChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [latestRelease, setLatestRelease] = useState<GitHubReleaseInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [autoCheckOnLaunch, setAutoCheckOnLaunchState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_CHECK_KEY)
      if (saved === null) return true
      return saved === 'true'
    } catch {
      return true
    }
  })

  const setAutoCheckOnLaunch = (val: boolean) => {
    setAutoCheckOnLaunchState(val)
    try {
      localStorage.setItem(AUTO_CHECK_KEY, String(val))
    } catch {}
  }

  // Load native app version if running under Tauri
  useEffect(() => {
    if (hasTauri) {
      invokeTauri<string>('get_app_version')
        .then((ver) => {
          if (ver && typeof ver === 'string') {
            setCurrentVersion(ver)
          }
        })
        .catch(() => {})
    }
  }, [])

  // Listen to native download progress and status events
  useEffect(() => {
    if (!hasTauri) return
    const unlisteners: Array<() => void> = []

    void listenTauriEvent<DownloadProgress>('laap:update-download-progress', (progress) => {
      setDownloadProgress(progress)
      if (progress.percentage >= 100) {
        setStatus('verifying')
      } else {
        setStatus('downloading')
      }
    }).then((fn) => {
      unlisteners.push(fn)
    })

    void listenTauriEvent<DownloadProgress>('updater-download-progress', (progress) => {
      setDownloadProgress(progress)
      if (progress.percentage >= 100) {
        setStatus('verifying')
      } else {
        setStatus('downloading')
      }
    }).then((fn) => {
      unlisteners.push(fn)
    })

    void listenTauriEvent<UpdateStatus>('laap:update-status', (newStatus) => {
      setStatus(newStatus)
    }).then((fn) => {
      unlisteners.push(fn)
    })

    return () => {
      unlisteners.forEach((fn) => {
        try {
          fn()
        } catch {
          // ignore unlisten errors in mocked/headless test environments
        }
      })
    }
  }, [])

  const checkForUpdates = useCallback(
    async (manual = false): Promise<GitHubReleaseInfo | null> => {
      if (!hasTauri && flavor === 'basic') {
        if (manual) {
          throw new Error('Update checks are not available in offline browser mode.')
        }
        return null
      }

      setChecking(true)
      setStatus('checking')
      setCheckError(null)
      setInstallError(null)

      try {
        if (hasTauri) {
          const res = await invokeTauri<NativeUpdateResult>('check_github_update')
          setLastChecked(new Date())

          const isInstallable =
            res.is_installable !== undefined
              ? Boolean(res.is_installable && res.signature && res.download_url)
              : Boolean(res.signature && res.download_url)
          const releaseInfo: GitHubReleaseInfo = {
            tagName: `v${res.latest_version}`,
            version: res.latest_version,
            name: res.release_name || `Release v${res.latest_version}`,
            body: res.release_notes || 'New updates and improvements are available.',
            htmlUrl: res.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            publishedAt: res.published_at || new Date().toISOString(),
            downloadUrl: res.download_url,
            signature: res.signature,
            edition: res.edition,
            platform: res.platform,
            isInstallable,
          }

          setLatestRelease(releaseInfo)

          const dismissed = localStorage.getItem(DISMISSED_KEY)
          if (res.has_update) {
            if (manual || dismissed !== res.latest_version) {
              setUpdateAvailable(true)
              setStatus('available')
            } else {
              setUpdateAvailable(false)
              setStatus('idle')
            }
          } else {
            setUpdateAvailable(false)
            setStatus('up-to-date')
          }

          return releaseInfo
        }

        // Web preview fallback (Team edition browser environment)
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 10000)
        try {
          const res = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
            {
              signal: controller.signal,
              headers: {
                Accept: 'application/vnd.github.v3+json',
              },
            },
          )

          if (!res.ok) {
            if (res.status === 404) {
              setUpdateAvailable(false)
              setStatus('up-to-date')
              setLastChecked(new Date())
              return null
            }
            if (res.status === 403) {
              throw new Error('GitHub API rate limit reached. Try again later.')
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

          setLastChecked(new Date())

          if (!data.tag_name) {
            setUpdateAvailable(false)
            setStatus('up-to-date')
            return null
          }

          const releaseVersion = data.tag_name.replace(/^v/, '')
          const releaseInfo: GitHubReleaseInfo = {
            tagName: data.tag_name,
            version: releaseVersion,
            name: data.name || `Release ${data.tag_name}`,
            body: data.body || 'New updates and improvements are available.',
            htmlUrl:
              data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            publishedAt: data.published_at || new Date().toISOString(),
            isInstallable: false,
          }

          setLatestRelease(releaseInfo)

          const isNew = isNewerVersion(releaseVersion, currentVersion)
          const dismissed = localStorage.getItem(DISMISSED_KEY)

          if (isNew) {
            if (manual || dismissed !== releaseVersion) {
              setUpdateAvailable(true)
              setStatus('available')
            } else {
              setUpdateAvailable(false)
              setStatus('idle')
            }
          } else {
            setUpdateAvailable(false)
            setStatus('up-to-date')
          }

          return releaseInfo
        } finally {
          window.clearTimeout(timeout)
        }
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause)
        setCheckError(msg)
        setStatus('error')
        if (manual) {
          throw new Error(msg.includes('rate limit') ? msg : 'Unable to check for updates (Offline/Blocked)')
        }
        return null
      } finally {
        setChecking(false)
      }
    },
    [currentVersion],
  )

  const downloadAndInstallUpdate = useCallback(
    async (forceCloseRiot = false): Promise<void> => {
      if (!hasTauri) {
        setInstallError('Native update installation is only available in the desktop application.')
        setStatus('error')
        return
      }

      if (!latestRelease?.isInstallable) {
        const reason = 'Automatic in-app update is only available for cryptographically verified updates. Please download the release installer from GitHub.'
        setInstallError(reason)
        setStatus('error')
        throw new Error(reason)
      }

      setInstallError(null)
      setStatus('downloading')
      setDownloadProgress({ downloaded: 0, total: 0, percentage: 0 })

      try {
        // Step 1: Preflight safety check
        const preflight = await invokeTauri<{
          safe: boolean
          active_match: boolean
          riot_running: boolean
          provisioning_busy: boolean
          reason?: string
        }>('get_updater_preflight_status')

        if (!preflight.safe) {
          const reason =
            preflight.reason ||
            (preflight.active_match
              ? 'An active match is in progress. Installation deferred until match concludes.'
              : 'A provisioning session is in progress. Complete it before updating.')
          setInstallError(reason)
          setStatus('error')
          throw new Error(reason)
        }

        // Step 2: Native download, verification & installation
        const res = await invokeTauri<{
          success: boolean
          installed_version: string
          message: string
        }>('native_install_update', { forceCloseRiot })

        if (res.success) {
          setStatus('ready')
        } else {
          throw new Error(res.message || 'Update installation failed.')
        }
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause)
        setInstallError(msg)
        setStatus('error')
        throw cause
      }
    },
    [latestRelease],
  )

  // Auto-check on launch if enabled and not offline-only browser test
  useEffect(() => {
    if (autoCheckOnLaunch && (hasTauri || flavor !== 'basic')) {
      void checkForUpdates(false)
    }
  }, [autoCheckOnLaunch, checkForUpdates])

  const dismissUpdate = useCallback(
    (forever = false) => {
      if (forever && latestRelease) {
        localStorage.setItem(DISMISSED_KEY, latestRelease.version)
      }
      setUpdateAvailable(false)
      setStatus('idle')
    },
    [latestRelease],
  )

  const openReleasePage = useCallback(() => {
    const url =
      latestRelease?.htmlUrl ||
      `https://github.com/${GITHUB_REPO}/releases/latest`
    void openExternalUrl(url)
  }, [latestRelease])

  return {
    currentVersion,
    status,
    checking,
    updateAvailable,
    latestRelease,
    downloadProgress,
    lastChecked,
    checkError,
    installError,
    autoCheckOnLaunch,
    setAutoCheckOnLaunch,
    checkForUpdates,
    downloadAndInstallUpdate,
    dismissUpdate,
    openReleasePage,
  }
}
