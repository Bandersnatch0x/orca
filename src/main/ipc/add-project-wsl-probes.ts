import { ipcMain } from 'electron'
import { getWslHomeAsync, listRunningWslDistrosAsync, listWslDistros } from '../wsl'

/**
 * Read-only WSL probes behind the Add Project WSL host rows — registered
 * beside the other wsl:* IPC in app.ts, extracted so the validation-heavy
 * handlers stay out of app.ts's line budget.
 */
export function registerAddProjectWslProbeHandlers(): void {
  ipcMain.handle('wsl:listRunningDistros', (): Promise<string[]> => listRunningWslDistrosAsync())
  // Why: validate before probing — an unvalidated distro lets unique junk keys
  // spawn unbounded wsl.exe probes (the cache only dedupes identical keys).
  ipcMain.handle('wsl:getDistroHome', (_event, distro: string): Promise<string | null> => {
    const name = typeof distro === 'string' ? distro.trim() : ''
    if (!name || name.length > 128 || !/^[A-Za-z0-9._-]+$/.test(name)) {
      return Promise.resolve(null)
    }
    if (!listWslDistros().includes(name)) {
      return Promise.resolve(null)
    }
    return getWslHomeAsync(name)
  })
}
