import type { Context } from 'koa'
import { findUserById } from '../public/users'
import { getUserTheme, toUserThemePayload } from '../services/theme/user-theme'
import {
  bootstrapSetup,
  completeSetup,
  getSetupStatus,
  getSetupSessionHeader,
  updateSetupAdmin,
  updateSetupGateway,
  updateSetupModel,
  validateSetup,
  type SetupAdminInput,
  type SetupGatewayInput,
  type SetupFailureResult,
  type SetupModelInput,
} from '../public/setup'
import { listProfileNamesFromDisk } from '../public/profile-config'

function setupSession(ctx: Context): string {
  return getSetupSessionHeader(ctx)
}

function isSetupFailureResult(result: SetupFailureResult | { ok: boolean }): result is SetupFailureResult {
  return result.ok === false
}

function setupError(result: SetupFailureResult, ctx: Context): void {
  ctx.status = result.status
  ctx.body = {
    error: result.message,
    code: result.code,
    setup: result.setup,
  }
}

function setupSessionBody(ctx: Context): Record<string, unknown> {
  return (ctx.request.body || {}) as Record<string, unknown>
}

function currentSetupTokenResponse(userId: number | null): Record<string, unknown> {
  if (!userId) return {}
  const user = findUserById(userId)
  if (!user) return {}
  return {
    userId: user.id,
    profiles: user.role === 'super_admin' ? listProfileNamesFromDisk() : [],
    theme: toUserThemePayload(getUserTheme(user.id)),
  }
}

export async function setupStatus(ctx: Context) {
  ctx.body = await getSetupStatus()
}

export async function bootstrap(ctx: Context) {
  const body = setupSessionBody(ctx)
  const code = String(body.code || body.installCode || body.install_code || '').trim()
  if (!code) {
    ctx.status = 400
    ctx.body = { error: 'Installation code is required' }
    return
  }

  const result = await bootstrapSetup(code)
  if (isSetupFailureResult(result)) {
    setupError(result, ctx)
    return
  }

  ctx.body = {
    sessionToken: result.sessionToken,
    setup: result.setup,
  }
}

export async function admin(ctx: Context) {
  const sessionToken = setupSession(ctx)
  const body = setupSessionBody(ctx)
  const input: SetupAdminInput = {
    username: String(body.username || '').trim(),
    password: String(body.password || ''),
  }
  const result = await updateSetupAdmin(sessionToken, input)
  if (isSetupFailureResult(result)) {
    setupError(result, ctx)
    return
  }
  ctx.body = result
}

export async function model(ctx: Context) {
  const sessionToken = setupSession(ctx)
  const body = setupSessionBody(ctx)
  const input: SetupModelInput = {
    profile: typeof body.profile === 'string' ? body.profile : undefined,
    provider: String(body.provider || '').trim(),
    model: String(body.model || '').trim(),
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : typeof body.base_url === 'string' ? body.base_url : undefined,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : typeof body.api_key === 'string' ? body.api_key : undefined,
  }
  const result = await updateSetupModel(sessionToken, input)
  if (isSetupFailureResult(result)) {
    setupError(result, ctx)
    return
  }
  ctx.body = result
}

export async function gateway(ctx: Context) {
  const sessionToken = setupSession(ctx)
  const body = setupSessionBody(ctx)
  const input: SetupGatewayInput = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : typeof body.skip === 'boolean' ? !body.skip : undefined,
    platforms: Array.isArray(body.platforms) ? body.platforms.map(value => String(value || '').trim()).filter(Boolean) : undefined,
  }
  const result = await updateSetupGateway(sessionToken, input)
  if (isSetupFailureResult(result)) {
    setupError(result, ctx)
    return
  }
  ctx.body = result
}

export async function validate(ctx: Context) {
  const result = await validateSetup(setupSession(ctx))
  if (isSetupFailureResult(result)) {
    setupError(result, ctx)
    return
  }
  ctx.body = result
}

export async function complete(ctx: Context) {
  const result = await completeSetup(setupSession(ctx))
  if (isSetupFailureResult(result)) {
    setupError(result, ctx)
    return
  }

  const user = result.setup.adminUserId ? findUserById(result.setup.adminUserId) : null
  ctx.body = {
    token: result.sessionToken,
    userId: user?.id || result.setup.adminUserId || 0,
    profiles: user?.role === 'super_admin' ? listProfileNamesFromDisk() : [],
    theme: user ? toUserThemePayload(getUserTheme(user.id)) : null,
    setup: result.setup,
    ...currentSetupTokenResponse(user?.id || result.setup.adminUserId || null),
  }
}
