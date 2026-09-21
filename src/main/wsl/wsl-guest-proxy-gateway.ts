import { isIP } from 'node:net'
import { normalizeProxyUrl, type NetworkProxySettings } from '../../shared/network-proxy'
import type { CodexAccountSelectionTarget } from '../codex-accounts/runtime-selection'
import { quotePosixShell } from '../../shared/wsl-login-shell-command'
import { runWslProcess } from './wsl-runner'

/**
 * Make a Settings > Advanced > Network proxy URL usable from inside a WSL distro.
 *
 * Under WSL2 NAT, a loopback proxy (`http://127.0.0.1:7890`) configured on Windows
 * is unreachable from guest shells — the guest's 127.0.0.1 is the distro itself,
 * not the host. Injecting that URL verbatim as HTTP_PROXY/HTTPS_PROXY leaves WSL
 * agents without a working proxy. The fix mirrors zai-org/ZCode's remote-WSL
 * backend (portions ported from packages/server/src/remote/wslProxy.ts,
 * Apache-2.0): ask the guest whether the address is reachable (WSL2 mirrored
 * networking and WSL1 keep loopback working), otherwise rewrite the hostname to
 * the host's gateway address and keep the rewrite only when the guest confirms
 * the rewritten address is reachable too.
 */

export function isLoopbackProxyHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    (isIP(normalized) === 4 && normalized.startsWith('127.'))
  )
}

export function replaceProxyHostname(proxyUrl: string, hostname: string): string {
  const url = new URL(proxyUrl)
  url.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname
  return url.toString()
}

/** Why bash: /dev/tcp is a bash runtime feature dash does not provide. */
export function buildWslProxyProbeScript(proxyUrl: string): string | null {
  let url: URL
  try {
    url = new URL(proxyUrl)
  } catch {
    return null
  }
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (!/^\d+$/u.test(port)) {
    return null
  }
  const hostname = url.hostname.replace(/^\[|\]$/gu, '')
  const tcpTarget = isIP(hostname) === 6 ? `[${hostname}]` : hostname
  const probeScript = `:</dev/tcp/${tcpTarget}/${port}`
  return [
    'if command -v timeout >/dev/null 2>&1 &&',
    `timeout 1 bash -c ${quotePosixShell(probeScript)} >/dev/null 2>&1; then`,
    'printf reachable',
    'else',
    'printf unreachable',
    'fi'
  ].join(' ')
}

export function parseWslProxyProbeOutput(output: string): boolean | undefined {
  const normalized = output.trim()
  if (normalized === 'reachable') {
    return true
  }
  if (normalized === 'unreachable') {
    return false
  }
  return undefined
}

/**
 * Emit `route=<gateway>` from the default route and one `resolv=<nameserver>`
 * candidate per resolv.conf entry. The route answer wins; resolv candidates are
 * validated as private/link-local before use (parseWslGatewayProbeOutput).
 */
export function buildWslGatewayProbeScript(): string {
  return [
    'gateway=',
    'if command -v ip >/dev/null 2>&1; then',
    `gateway=$(ip route show default 2>/dev/null | awk '$1=="default" && $2=="via" {print $3; exit}'); fi`,
    'if [ -n "$gateway" ]; then printf "route=%s " "$gateway"; fi',
    `if [ -r /etc/resolv.conf ]; then awk '$1=="nameserver" {print "resolv=" $2}' /etc/resolv.conf; fi`
  ].join('; ')
}

export function parseWslGatewayProbeOutput(output: string): string | null {
  for (const token of output.trim().split(/\s+/u)) {
    const tagged = /^(route|resolv)=(.+)$/u.exec(token)
    const source = tagged?.[1] ?? 'resolv'
    const candidate = (tagged?.[2] ?? token).replace(/^\[|\]$/gu, '')
    if (isWslGatewayCandidate(candidate, source)) {
      return candidate
    }
  }
  return null
}

function isWslGatewayCandidate(candidate: string, source: string): boolean {
  const addressType = isIP(candidate)
  if (addressType !== 4 && addressType !== 6) {
    return false
  }
  if (candidate === '::1' || (addressType === 4 && candidate.startsWith('127.'))) {
    return false
  }
  // Why: a public DNS resolver (e.g. 8.8.8.8 in a hand-edited resolv.conf) is
  // not the host and would silently black-hole the proxied traffic.
  if (source !== 'resolv') {
    return true
  }
  return isPrivateOrLinkLocalAddress(candidate, addressType)
}

function isPrivateOrLinkLocalAddress(candidate: string, addressType: number): boolean {
  if (addressType === 6) {
    const normalized = candidate.toLowerCase()
    return (
      normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/u.test(normalized)
    )
  }
  const octets = candidate.split('.').map(Number)
  const firstOctet = octets[0] ?? -1
  const secondOctet = octets[1] ?? -1
  return (
    octets.length === 4 &&
    (firstOctet === 10 ||
      (firstOctet === 192 && secondOctet === 168) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
      candidate.startsWith('169.254.'))
  )
}

async function runWslProbe(script: string, distro: string | null): Promise<string> {
  const result = await runWslProcess({
    script,
    shell: 'bash',
    distro: distro ?? undefined,
    loginPath: 'none',
    timeoutMs: 5_000
  })
  return result.stdout
}

// ─── Probe verdict cache ────────────────────────────────────────────

const PROBE_VERDICT_TTL_MS = 60_000

type ProbeVerdictCacheEntry = {
  expiresAt: number
  promise: Promise<boolean | undefined>
}

const probeVerdictCache = new Map<string, ProbeVerdictCacheEntry>()

async function probeProxyReachability(
  proxyUrl: string,
  distro: string | null
): Promise<boolean | undefined> {
  const script = buildWslProxyProbeScript(proxyUrl)
  if (!script) {
    return undefined
  }
  // Why cache: PTY spawns repeat this probe for every pane; a verdict stays
  // valid for a minute, and mirrored-networking status does not flap faster.
  const cacheKey = `${distro ?? ''}|${proxyUrl}`
  return getCachedProbeVerdict(cacheKey, async () =>
    parseWslProxyProbeOutput(await runWslProbe(script, distro))
  )
}

function getCachedProbeVerdict(
  cacheKey: string,
  load: () => Promise<boolean | undefined>
): Promise<boolean | undefined> {
  const cached = probeVerdictCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }
  const entry: ProbeVerdictCacheEntry = {
    expiresAt: Date.now() + PROBE_VERDICT_TTL_MS,
    promise: Promise.resolve()
      .then(load)
      .catch(() => undefined)
  }
  probeVerdictCache.set(cacheKey, entry)
  return entry.promise
}

// ─── Gateway cache ──────────────────────────────────────────────────

const GATEWAY_SUCCESS_TTL_MS = 5 * 60_000
const GATEWAY_FAILURE_TTL_MS = 30_000

type GatewayCacheEntry = {
  expiresAt: number
  promise: Promise<string | null>
}

const gatewayCache = new Map<string, GatewayCacheEntry>()

function resolveWslHostGateway(distro: string | null): Promise<string | null> {
  // Why per-distro: each distro has its own NAT namespace and gateway.
  const cacheKey = distro ?? ''
  const cached = gatewayCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }
  const entry: GatewayCacheEntry = {
    expiresAt: Date.now() + GATEWAY_SUCCESS_TTL_MS,
    // Why: a failed or empty probe must stay retryable, but per-spawn retries
    // would put multiple wsl.exe calls on the PTY spawn path; brief negative
    // caching bounds the spawn rate the way the distro list cache does.
    promise: Promise.resolve()
      .then(async () => {
        const output = await runWslProbe(buildWslGatewayProbeScript(), distro)
        return parseWslGatewayProbeOutput(output)
      })
      .catch(() => null)
  }
  gatewayCache.set(cacheKey, entry)
  void entry.promise.then((gateway) => {
    if (gatewayCache.get(cacheKey) === entry && !gateway) {
      entry.expiresAt = Date.now() + GATEWAY_FAILURE_TTL_MS
    }
  })
  return entry.promise
}

// ─── Entry point ────────────────────────────────────────────────────

export type WslGuestProxyContext = {
  isWsl: boolean
  /** Undefined/null resolves the default distro. */
  distro?: string | null
}

/**
 * Returns `settings` unchanged on every fast path and on any probe failure, so
 * callers can unconditionally feed the result where a NetworkProxySettings is
 * expected. Only a guest-confirmed gateway rewrite produces a new object.
 */
export async function resolveWslGuestProxySettings(
  settings: NetworkProxySettings | null | undefined,
  context: WslGuestProxyContext
): Promise<NetworkProxySettings | undefined> {
  if (!context.isWsl || process.platform !== 'win32') {
    return settings ?? undefined
  }
  const configured = normalizeProxyUrl(settings?.httpProxyUrl)
  if (!configured.ok || !configured.value) {
    return settings ?? undefined
  }
  let loopbackUrl: URL
  try {
    loopbackUrl = new URL(configured.value)
  } catch {
    return settings ?? undefined
  }
  if (!isLoopbackProxyHostname(loopbackUrl.hostname)) {
    return settings ?? undefined
  }

  const distro = context.distro ?? null
  // Mirrored networking (or a proxy already listening on the WSL interface)
  // keeps loopback working; the URL must then survive untouched.
  if ((await probeProxyReachability(configured.value, distro)) === true) {
    return settings ?? undefined
  }

  const gateway = await resolveWslHostGateway(distro)
  if (!gateway) {
    return settings ?? undefined
  }
  const gatewayProxyUrl = replaceProxyHostname(configured.value, gateway)
  if ((await probeProxyReachability(gatewayProxyUrl, distro)) !== true) {
    return settings ?? undefined
  }
  return { ...settings, httpProxyUrl: gatewayProxyUrl }
}

export function _resetWslGuestProxyCachesForTests(): void {
  probeVerdictCache.clear()
  gatewayCache.clear()
}

/**
 * PTY-spawn convenience: a `{ runtime: 'wsl' }` selection target is built from
 * the same WSL shell/UNC-cwd predicate the plain context's `isWsl` wraps, so
 * the target alone decides whether the rewrite applies.
 */
export async function wslProxyForTarget(
  settings: NetworkProxySettings | null | undefined,
  target: CodexAccountSelectionTarget
): Promise<NetworkProxySettings | undefined> {
  return resolveWslGuestProxySettings(settings, {
    isWsl: target.runtime === 'wsl',
    distro: target.runtime === 'wsl' ? target.wslDistro : null
  })
}
