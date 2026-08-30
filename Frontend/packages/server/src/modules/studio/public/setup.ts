import { createHash, randomBytes } from 'crypto'
import { join, resolve } from 'path'
import { homedir } from 'os'
import type { Duplex } from 'stream'
import type { Context, Next } from 'koa'
import { countActiveSuperAdmins, countUsers, createUser, findFirstUser, findUserById, listUsers, type UserRecord } from './users'
import {
  PROVIDER_ENV_MAP,
  readConfigYamlForProfile,
  saveEnvValueForProfile,
  updateConfigYamlForProfile,
  type ProviderEnvironmentMap,
} from './profile-config'
import { readAppConfig, writeAppConfig } from './app-config'
import { config } from './config'
import { fetchProviderModels } from './provider-catalog'
import { issueUserJwt } from './auth'
import { logger } from './logging'
import { safeFileStore } from './safe-file-store'
import { getCompatibleCustomProviders } from '../../studio/contracts/provider-compat'
import { PROVIDER_PRESETS, buildProviderModelMap } from '../../studio/contracts/providers'

const SETUP_STATE_FILE = join(config.appHome, 'setup-state.json')
const SETUP_SESSION_HEADER = 'x-hermes-setup-session'
const INSTALL_CODE_TTL_MS = 24 * 60 * 60 * 1000
const INSTALL_CODE_FAILURE_LIMIT = 5
const SETUP_SESSION_TTL_MS = 60 * 60 * 1000
const DEFAULT_PROFILE = 'default'

export type SetupMigrationState = 'fresh' | 'legacy-users' | 'legacy-model' | 'legacy-ready'
export type SetupValidationMode = 'pending' | 'ready' | 'failed'

export interface SetupStepState {
  done: boolean
  updatedAt: number
}

export interface SetupProviderOption {
  provider: string
  label: string
  baseUrl: string
  models: string[]
  builtin: boolean
  apiMode?: 'chat_completions' | 'codex_responses' | 'anthropic_messages' | 'bedrock_converse' | 'codex_app_server'
}

export interface SetupStatusSnapshot {
  setupComplete: boolean
  requiresSetup: boolean
  migrationState: SetupMigrationState
  hasUsers: boolean
  hasActiveSuperAdmin: boolean
  adminConfigured: boolean
  modelConfigured: boolean
  modelReady: boolean
  gatewayConfigured: boolean
  gatewayEnabled: boolean
  gatewaySkipped: boolean
  gatewayPlatforms: string[]
  providerOptions: SetupProviderOption[]
  installCodeIssuedAt: number
  installCodeExpiresAt: number
  installCodeFailureCount: number
  installCodeRotationCount: number
  setupSessionActive: boolean
  setupSessionExpiresAt: number
  setupSessionIssuedAt: number
  completedAt: number
  validatedAt: number
  lastValidationMode: SetupValidationMode
  lastValidationError: string
  adminUserId: number | null
  adminUsername: string
  modelProfile: string
  modelProvider: string
  modelName: string
  canValidate: boolean
  canComplete: boolean
  steps: {
    bootstrap: SetupStepState
    admin: SetupStepState
    model: SetupStepState
    gateway: SetupStepState
    validate: SetupStepState
    complete: SetupStepState
  }
}

interface PersistedSetupState {
  version: 1
  setupComplete: boolean
  completedAt: number
  migrationState: SetupMigrationState
  migrationDetectedAt: number
  installCodeHash: string
  installCodeIssuedAt: number
  installCodeExpiresAt: number
  installCodeFailureCount: number
  installCodeRotationCount: number
  setupSessionHash: string
  setupSessionIssuedAt: number
  setupSessionExpiresAt: number
  adminConfiguredAt: number
  adminUserId: number
  adminUsername: string
  modelConfiguredAt: number
  modelReady: boolean
  modelProfile: string
  modelProvider: string
  modelName: string
  gatewayConfiguredAt: number
  gatewayEnabled: boolean
  gatewayPlatforms: string[]
  lastValidatedAt: number
  lastValidationMode: SetupValidationMode
  lastValidationError: string
}

export interface SetupBootstrapResult {
  ok: true
  sessionToken: string
  setup: SetupStatusSnapshot
}

export interface SetupFailureResult {
  ok: false
  status: number
  code: string
  message: string
  setup: SetupStatusSnapshot
}

export interface SetupAdminInput {
  username: string
  password: string
}

export interface SetupModelInput {
  profile?: string
  provider: string
  model: string
  baseUrl?: string
  apiKey?: string
}

export interface SetupGatewayInput {
  enabled?: boolean
  platforms?: string[]
}

export interface SetupValidationResult {
  ok: boolean
  message: string
  setup: SetupStatusSnapshot
  checks: {
    admin: boolean
    model: boolean
    gateway: boolean
  }
}

type CompletionListener = (setup: SetupStatusSnapshot) => void | Promise<void>

function now(): number {
  return Date.now()
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeInputText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePlatformList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(item => normalizeInputText(item)).filter(Boolean))]
}

function generateReadableCode(groups = 3, groupLength = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(groups * groupLength)
  const parts: string[] = []
  for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
    let chunk = ''
    for (let index = 0; index < groupLength; index += 1) {
      const byte = bytes[groupIndex * groupLength + index] || 0
      chunk += alphabet[byte % alphabet.length]
    }
    parts.push(chunk)
  }
  return parts.join('-')
}

function installCodeRecordDir(): string {
  const custom = normalizeInputText(process.env.HERMES_INSTALL_CODE_DIR)
  return custom ? resolve(custom) : homedir()
}

function formatInstallCodeTimestamp(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z')
}

async function writeInstallCodeRecord(
  code: string,
  issuedAt: number,
  expiresAt: number,
  rotationCount: number,
  reason: string,
): Promise<void> {
  const fileName = `hermes-install-code-${formatInstallCodeTimestamp(issuedAt)}-r${rotationCount}.txt`
  const filePath = join(installCodeRecordDir(), fileName)
  const body = [
    'Hermes Studio 安装码记录',
    `安装时间: ${new Date(issuedAt).toISOString()}`,
    `过期时间: ${new Date(expiresAt).toISOString()}`,
    `轮换次数: ${rotationCount}`,
    `轮换原因: ${reason}`,
    `安装码: ${code}`,
    '',
  ].join('\n')

  try {
    await safeFileStore.writeText(filePath, body)
  } catch (error) {
    logger.warn({ error, filePath }, '[setup] failed to write installation code record')
  }
}

function defaultState(): PersistedSetupState {
  return {
    version: 1,
    setupComplete: false,
    completedAt: 0,
    migrationState: 'fresh',
    migrationDetectedAt: 0,
    installCodeHash: '',
    installCodeIssuedAt: 0,
    installCodeExpiresAt: 0,
    installCodeFailureCount: 0,
    installCodeRotationCount: 0,
    setupSessionHash: '',
    setupSessionIssuedAt: 0,
    setupSessionExpiresAt: 0,
    adminConfiguredAt: 0,
    adminUserId: 0,
    adminUsername: '',
    modelConfiguredAt: 0,
    modelReady: false,
    modelProfile: DEFAULT_PROFILE,
    modelProvider: '',
    modelName: '',
    gatewayConfiguredAt: 0,
    gatewayEnabled: false,
    gatewayPlatforms: [],
    lastValidatedAt: 0,
    lastValidationMode: 'pending',
    lastValidationError: '',
  }
}

function toSetupStepState(doneAt: number): SetupStepState {
  return {
    done: doneAt > 0,
    updatedAt: doneAt,
  }
}

function requestHeader(ctx: Context, name: string): string {
  return ctx.get(name).trim()
}

function setupBypassPath(path: string): boolean {
  return path === '/livez'
    || path === '/health'
    || path === '/api/auth/status'
    || path.startsWith('/api/setup/')
}

function normalizeProfileName(profile?: string): string {
  return normalizeInputText(profile) || DEFAULT_PROFILE
}

function hasUsableModelSelection(config: Record<string, any>): boolean {
  try {
    const modelConfig = config?.model
    const model = typeof modelConfig === 'string'
      ? modelConfig.trim()
      : normalizeInputText(modelConfig?.default)
    const provider = typeof modelConfig === 'object'
      ? normalizeInputText(modelConfig?.provider)
      : ''
    if (!model || !provider) return false
    const presetModels = buildProviderModelMap()[provider] || PROVIDER_PRESETS.find(preset => preset.value === provider)?.models || []
    if (presetModels.includes(model)) return true

    const customProviders = getCompatibleCustomProviders(config)
    return customProviders.some(entry => {
      const providerKey = normalizeInputText(entry.provider_key) || normalizeInputText(entry.name)
      if (providerKey !== provider) return false
      const configuredModels = new Set<string>()
      if (typeof entry.model === 'string' && entry.model.trim()) {
        configuredModels.add(entry.model.trim())
      }
      if (entry.models && typeof entry.models === 'object' && !Array.isArray(entry.models)) {
        for (const modelId of Object.keys(entry.models)) {
          const normalized = normalizeInputText(modelId)
          if (normalized) configuredModels.add(normalized)
        }
      }
      return configuredModels.has(model)
    })
  } catch {
    return false
  }
}

function providerOptions(): SetupProviderOption[] {
  return PROVIDER_PRESETS.map(preset => ({
    provider: preset.value,
    label: preset.label,
    baseUrl: preset.base_url,
    models: [...preset.models],
    builtin: preset.builtin,
    apiMode: preset.api_mode,
  }))
}

function validUserForSetup(user: UserRecord | null): boolean {
  return !!user && user.status === 'active'
}

class SetupManager {
  private state: PersistedSetupState | null = null
  private runtimeInstallCode = ''
  private runtimeSetupSession = ''
  private installCodeTimer: NodeJS.Timeout | null = null
  private sessionTimer: NodeJS.Timeout | null = null
  private listeners = new Set<CompletionListener>()
  private queue: Promise<void> = Promise.resolve()

  private async lock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.queue
    let release!: () => void
    this.queue = new Promise<void>(resolve => { release = resolve })
    await previous.catch(() => undefined)
    try {
      return await task()
    } finally {
      release()
    }
  }

  private async loadState(): Promise<PersistedSetupState> {
    if (this.state) return this.state
    try {
      const raw = await safeFileStore.readText(SETUP_STATE_FILE)
      const parsed = JSON.parse(raw) as Partial<PersistedSetupState>
      this.state = { ...defaultState(), ...parsed, version: 1 }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        logger.warn(error, '[setup] failed to read setup state file')
      }
      this.state = defaultState()
    }
    return this.state
  }

  private async persistState(state = this.state): Promise<void> {
    if (!state) return
    await safeFileStore.writeText(SETUP_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { backup: true })
  }

  private clearTimers(): void {
    if (this.installCodeTimer) {
      clearTimeout(this.installCodeTimer)
      this.installCodeTimer = null
    }
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
  }

  private scheduleInstallCodeRotation(state: PersistedSetupState): void {
    if (this.installCodeTimer) {
      clearTimeout(this.installCodeTimer)
      this.installCodeTimer = null
    }
    if (state.setupComplete || !state.installCodeExpiresAt) return
    const delay = Math.max(0, state.installCodeExpiresAt - now())
    this.installCodeTimer = setTimeout(() => {
      void this.lock(async () => {
        const current = await this.loadState()
        if (current.setupComplete) return
        if (!this.runtimeInstallCode) return
        await this.rotateInstallCode(current, 'expired')
      })
    }, delay)
    this.installCodeTimer.unref?.()
  }

  private scheduleSessionExpiry(state: PersistedSetupState): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
    if (!state.setupSessionExpiresAt || state.setupComplete) return
    const delay = Math.max(0, state.setupSessionExpiresAt - now())
    this.sessionTimer = setTimeout(() => {
      void this.lock(async () => {
        const current = await this.loadState()
        if (current.setupComplete) return
        current.setupSessionHash = ''
        current.setupSessionIssuedAt = 0
        current.setupSessionExpiresAt = 0
        this.runtimeSetupSession = ''
        await this.persistState(current)
      })
    }, delay)
    this.sessionTimer.unref?.()
  }

  private async rotateInstallCode(state: PersistedSetupState, reason: string): Promise<string> {
    const code = generateReadableCode()
    const timestamp = now()
    state.installCodeHash = hashValue(code)
    state.installCodeIssuedAt = timestamp
    state.installCodeExpiresAt = timestamp + INSTALL_CODE_TTL_MS
    state.installCodeFailureCount = 0
    state.installCodeRotationCount += 1
    this.runtimeInstallCode = code
    await this.persistState(state)
    await writeInstallCodeRecord(
      code,
      state.installCodeIssuedAt,
      state.installCodeExpiresAt,
      state.installCodeRotationCount,
      reason,
    )
    logger.info({
      install_code: code,
      reason,
      expires_at: state.installCodeExpiresAt,
      rotation: state.installCodeRotationCount,
    }, '[setup] installation code rotated')
    this.scheduleInstallCodeRotation(state)
    return code
  }

  private async ensureInstallCode(state: PersistedSetupState, reason: string): Promise<void> {
    if (state.setupComplete) {
      this.runtimeInstallCode = ''
      this.clearTimers()
      return
    }
    const expired = !state.installCodeHash || !state.installCodeExpiresAt || now() >= state.installCodeExpiresAt
    const lockedOut = state.installCodeFailureCount >= INSTALL_CODE_FAILURE_LIMIT
    const needsRotation = expired || lockedOut || !this.runtimeInstallCode
    if (needsRotation) {
      await this.rotateInstallCode(state, reason)
      return
    }
    this.scheduleInstallCodeRotation(state)
  }

  private async refreshDerivedState(state: PersistedSetupState): Promise<void> {
    if (state.setupComplete) {
      this.clearTimers()
      this.runtimeInstallCode = ''
      this.runtimeSetupSession = ''
      return
    }

    const hasUsers = countUsers() > 0
    const hasModel = await this.hasUsableModel(DEFAULT_PROFILE)
    state.modelReady = hasModel
    const nextMigrationState: SetupMigrationState = hasUsers && hasModel
      ? 'legacy-ready'
      : hasUsers
        ? 'legacy-users'
        : hasModel
          ? 'legacy-model'
          : 'fresh'

    const migrationChanged = state.migrationState !== nextMigrationState || state.migrationDetectedAt === 0
    if (migrationChanged) {
      state.migrationState = nextMigrationState
      state.migrationDetectedAt = now()
    }

    if (hasUsers && hasModel) {
      state.setupComplete = true
      state.completedAt = now()
      state.lastValidatedAt = state.completedAt
      state.lastValidationMode = 'ready'
      state.lastValidationError = ''
      this.runtimeInstallCode = ''
      this.runtimeSetupSession = ''
      this.clearTimers()
      await this.persistState(state)
      logger.info('[setup] existing users and model configuration detected; setup marked complete')
    } else if (migrationChanged) {
      await this.persistState(state)
    }
  }

  private async hasUsableModel(profile: string): Promise<boolean> {
    try {
      const config = await readConfigYamlForProfile(profile)
      return hasUsableModelSelection(config)
    } catch {
      return false
    }
  }

  private snapshot(state: PersistedSetupState): SetupStatusSnapshot {
    const hasUsers = countUsers() > 0
    const hasActiveSuperAdmin = countActiveSuperAdmins() > 0
    const adminConfigured = state.adminConfiguredAt > 0 || hasUsers
    const modelConfigured = state.modelConfiguredAt > 0
    const modelReady = state.modelReady || state.setupComplete
    const gatewaySkipped = !state.gatewayEnabled && state.gatewayConfiguredAt === 0
    const gatewayConfigured = state.gatewayConfiguredAt > 0 || gatewaySkipped || state.setupComplete
    const sessionActive = !!state.setupSessionHash && state.setupSessionExpiresAt > now()
    const canValidate = adminConfigured && (modelConfigured || modelReady)
    const canComplete = canValidate
    return {
      setupComplete: state.setupComplete,
      requiresSetup: !state.setupComplete,
      migrationState: state.migrationState,
      hasUsers,
      hasActiveSuperAdmin,
      adminConfigured,
      modelConfigured,
      modelReady,
      gatewayConfigured,
      gatewayEnabled: state.gatewayEnabled,
      gatewaySkipped,
      gatewayPlatforms: [...state.gatewayPlatforms],
      providerOptions: providerOptions(),
      installCodeIssuedAt: state.installCodeIssuedAt,
      installCodeExpiresAt: state.installCodeExpiresAt,
      installCodeFailureCount: state.installCodeFailureCount,
      installCodeRotationCount: state.installCodeRotationCount,
      setupSessionActive: sessionActive,
      setupSessionExpiresAt: state.setupSessionExpiresAt,
      setupSessionIssuedAt: state.setupSessionIssuedAt,
      completedAt: state.completedAt,
      validatedAt: state.lastValidatedAt,
      lastValidationMode: state.lastValidationMode,
      lastValidationError: state.lastValidationError,
      adminUserId: state.adminUserId > 0 ? state.adminUserId : null,
      adminUsername: state.adminUsername,
      modelProfile: state.modelProfile,
      modelProvider: state.modelProvider,
      modelName: state.modelName,
      canValidate,
      canComplete,
      steps: {
        bootstrap: toSetupStepState(state.installCodeIssuedAt),
        admin: toSetupStepState(state.adminConfiguredAt),
        model: toSetupStepState(state.modelConfiguredAt),
        gateway: toSetupStepState(state.gatewayConfiguredAt),
        validate: toSetupStepState(state.lastValidatedAt),
        complete: toSetupStepState(state.completedAt),
      },
    }
  }

  private async ensureInitialized(reason = 'startup'): Promise<PersistedSetupState> {
    const state = await this.loadState()
    await this.refreshDerivedState(state)
    await this.ensureInstallCode(state, reason)
    await this.persistState(state)
    this.scheduleSessionExpiry(state)
    return state
  }

  private async setSession(state: PersistedSetupState): Promise<string> {
    const token = generateReadableCode(4, 6).replace(/-/g, '')
    const timestamp = now()
    state.setupSessionHash = hashValue(token)
    state.setupSessionIssuedAt = timestamp
    state.setupSessionExpiresAt = timestamp + SETUP_SESSION_TTL_MS
    this.runtimeSetupSession = token
    await this.persistState(state)
    this.scheduleSessionExpiry(state)
    return token
  }

  private async requireSession(state: PersistedSetupState, token: string): Promise<SetupFailureResult | null> {
    const provided = normalizeInputText(token)
    if (!provided) {
      return {
        ok: false,
        status: 401,
        code: 'setup_session_required',
        message: '需要有效的安装会话',
        setup: this.snapshot(state),
      }
    }
    const expired = !state.setupSessionHash || state.setupSessionExpiresAt <= now()
    if (expired || hashValue(provided) !== state.setupSessionHash) {
      return {
        ok: false,
        status: 401,
        code: 'setup_session_invalid',
        message: '安装会话无效或已过期',
        setup: this.snapshot(state),
      }
    }
    this.runtimeSetupSession = provided
    return null
  }

  private async validateCurrentSetup(state: PersistedSetupState): Promise<SetupValidationResult> {
    const adminOk = state.adminConfiguredAt > 0 || countUsers() > 0
    state.modelReady = await this.hasUsableModel(state.modelProfile)
    const modelOk = state.modelReady
    const gatewayOk = !state.gatewayEnabled || state.gatewayPlatforms.length > 0
    const ok = adminOk && modelOk && gatewayOk
    state.lastValidatedAt = now()
    state.lastValidationMode = ok ? 'ready' : 'failed'
    state.lastValidationError = ok ? '' : [
      adminOk ? '' : '需要管理员账户',
      modelOk ? '' : '需要可用的模型配置',
      gatewayOk ? '' : '请至少选择一个网关平台，或者直接跳过网关步骤',
    ].filter(Boolean).join('; ')
    await this.persistState(state)
    return {
      ok,
      message: ok ? '安装已就绪，可以完成' : state.lastValidationError,
      setup: this.snapshot(state),
      checks: {
        admin: adminOk,
        model: modelOk,
        gateway: gatewayOk,
      },
    }
  }

  async getStatus(): Promise<SetupStatusSnapshot> {
    return this.lock(async () => this.snapshot(await this.ensureInitialized('status')))
  }

  async bootstrap(code: string): Promise<SetupBootstrapResult | SetupFailureResult> {
    return this.lock(async () => {
      const state = await this.ensureInitialized('bootstrap')
      if (state.setupComplete) {
        return {
          ok: true,
          sessionToken: '',
          setup: this.snapshot(state),
        }
      }

      const submitted = normalizeInputText(code)
      if (!submitted || hashValue(submitted) !== state.installCodeHash) {
        state.installCodeFailureCount += 1
        state.lastValidatedAt = now()
        state.lastValidationMode = 'failed'
        state.lastValidationError = '安装码无效'
        await this.persistState(state)
        if (state.installCodeFailureCount >= INSTALL_CODE_FAILURE_LIMIT) {
          await this.rotateInstallCode(state, 'failure-lockout')
          return {
            ok: false,
            status: 429,
            code: 'setup_code_locked',
            message: '安装码已因失败次数过多而轮换',
            setup: this.snapshot(state),
          }
        }
        if (!submitted && state.installCodeExpiresAt <= now()) {
          return {
            ok: false,
            status: 410,
            code: 'setup_code_expired',
            message: '安装码已过期',
            setup: this.snapshot(state),
          }
        }
        return {
          ok: false,
          status: 401,
          code: 'setup_code_invalid',
          message: '安装码无效',
          setup: this.snapshot(state),
        }
      }

      state.installCodeFailureCount = 0
      const sessionToken = await this.setSession(state)
      return {
        ok: true,
        sessionToken,
        setup: this.snapshot(state),
      }
    })
  }

  async updateAdmin(sessionToken: string, input: SetupAdminInput): Promise<SetupValidationResult | SetupFailureResult> {
    return this.lock(async () => {
      const state = await this.ensureInitialized('admin')
      const sessionError = await this.requireSession(state, sessionToken)
      if (sessionError) return sessionError

      const username = normalizeInputText(input.username)
      const password = normalizeInputText(input.password)
      if (username.length < 2 || password.length < 6) {
        return {
          ok: false,
          status: 400,
          code: 'setup_admin_invalid',
          message: '用户名至少需要 2 个字符，密码至少需要 6 个字符',
          setup: this.snapshot(state),
        }
      }

      const existingActiveSuperAdmin = listUsers().find(user => user.role === 'super_admin' && user.status === 'active')
      let user = existingActiveSuperAdmin ? findUserById(existingActiveSuperAdmin.id) : null
      if (!user || !validUserForSetup(user)) {
        user = createUser({
          username,
          password,
          role: 'super_admin',
          status: 'active',
          profiles: [DEFAULT_PROFILE],
          defaultProfile: DEFAULT_PROFILE,
        })
      }

      if (!user) {
        return {
          ok: false,
          status: 500,
          code: 'setup_admin_failed',
          message: '创建首个管理员失败',
          setup: this.snapshot(state),
        }
      }

      state.adminConfiguredAt = now()
      state.adminUserId = user.id
      state.adminUsername = user.username
      state.lastValidatedAt = 0
      state.lastValidationMode = 'pending'
      state.lastValidationError = ''
      await this.persistState(state)
      return {
        ok: true,
        message: '管理员已配置',
        setup: this.snapshot(state),
        checks: {
          admin: true,
          model: state.modelConfiguredAt > 0 || await this.hasUsableModel(state.modelProfile),
          gateway: state.gatewayConfiguredAt > 0 || !state.gatewayEnabled,
        },
      }
    })
  }

  async updateModel(sessionToken: string, input: SetupModelInput): Promise<SetupValidationResult | SetupFailureResult> {
    return this.lock(async () => {
      const state = await this.ensureInitialized('model')
      const sessionError = await this.requireSession(state, sessionToken)
      if (sessionError) return sessionError

      const profile = normalizeProfileName(input.profile)
      if (profile !== DEFAULT_PROFILE) {
        return {
          ok: false,
          status: 400,
          code: 'setup_profile_unsupported',
          message: '首次安装仅会写入默认配置档案',
          setup: this.snapshot(state),
        }
      }

      const provider = normalizeInputText(input.provider)
      const model = normalizeInputText(input.model)
      const baseUrl = normalizeInputText(input.baseUrl)
      const apiKey = normalizeInputText(input.apiKey)
      if (!provider || !model) {
        return {
          ok: false,
          status: 400,
          code: 'setup_model_invalid',
          message: '服务商和模型不能为空',
          setup: this.snapshot(state),
        }
      }

      try {
        await updateConfigYamlForProfile(profile, (current) => {
          const modelConfig = typeof current.model === 'object' && current.model && !Array.isArray(current.model)
            ? { ...current.model as Record<string, unknown> }
            : {}
          return {
            ...current,
            model: {
              ...modelConfig,
              default: model,
              provider,
            },
          }
        })

        const providerEnv = (await import('./profile-config')).PROVIDER_ENV_MAP as ProviderEnvironmentMap
        const envMap = providerEnv[provider]
        if (envMap?.base_url_env && baseUrl) {
          await saveEnvValueForProfile(profile, envMap.base_url_env, baseUrl)
        }
        if (envMap?.api_key_env && apiKey) {
          await saveEnvValueForProfile(profile, envMap.api_key_env, apiKey)
        }

        if (baseUrl && apiKey) {
          const remoteModels = await fetchProviderModels(baseUrl, apiKey)
          if (remoteModels.length > 0 && !remoteModels.includes(model)) {
            state.modelReady = false
            state.lastValidatedAt = now()
            state.lastValidationMode = 'failed'
            state.lastValidationError = `服务商未返回模型“${model}”`
            await this.persistState(state)
            return {
              ok: false,
              status: 422,
              code: 'setup_model_unavailable',
              message: state.lastValidationError,
              setup: this.snapshot(state),
            }
          }
        }
      } catch (error) {
        logger.warn(error, '[setup] failed to persist model configuration')
        return {
          ok: false,
          status: 500,
          code: 'setup_model_save_failed',
          message: '保存模型配置失败',
          setup: this.snapshot(state),
        }
      }

      state.modelConfiguredAt = now()
      state.modelProfile = profile
      state.modelProvider = provider
      state.modelName = model
      state.modelReady = await this.hasUsableModel(profile)
      state.lastValidatedAt = 0
      state.lastValidationMode = 'pending'
      state.lastValidationError = ''
      const validation = await this.validateCurrentSetup(state)
      return {
        ...validation,
        message: validation.ok ? '模型已保存' : validation.message,
      }
    })
  }

  async updateGateway(sessionToken: string, input: SetupGatewayInput): Promise<SetupValidationResult | SetupFailureResult> {
    return this.lock(async () => {
      const state = await this.ensureInitialized('gateway')
      const sessionError = await this.requireSession(state, sessionToken)
      if (sessionError) return sessionError

      const enabled = input.enabled !== false
      const platforms = normalizePlatformList(input.platforms)
      state.gatewayEnabled = enabled
      state.gatewayPlatforms = enabled ? platforms : []
      state.gatewayConfiguredAt = now()
      state.lastValidationMode = 'pending'
      state.lastValidationError = ''

      try {
        const appConfig = await readAppConfig()
        await writeAppConfig({
          gatewayAutoStart: {
            ...(appConfig.gatewayAutoStart || {}),
            enabled,
          },
        })
      } catch (error) {
        logger.warn(error, '[setup] failed to persist gateway configuration')
      }

      await this.persistState(state)
      const validation = await this.validateCurrentSetup(state)
      return {
        ...validation,
        message: validation.ok ? '网关设置已保存' : validation.message,
      }
    })
  }

  async validate(sessionToken: string): Promise<SetupValidationResult | SetupFailureResult> {
    return this.lock(async () => {
      const state = await this.ensureInitialized('validate')
      const sessionError = await this.requireSession(state, sessionToken)
      if (sessionError) return sessionError
      return this.validateCurrentSetup(state)
    })
  }

  async complete(sessionToken: string): Promise<SetupBootstrapResult | SetupFailureResult> {
    return this.lock(async () => {
      const state = await this.ensureInitialized('complete')
      const sessionError = await this.requireSession(state, sessionToken)
      if (sessionError) return sessionError
      const validation = await this.validateCurrentSetup(state)
      if (!validation.ok) {
        return {
          ok: false,
          status: 422,
          code: 'setup_not_ready',
          message: validation.message,
          setup: validation.setup,
        }
      }

      state.setupComplete = true
      state.completedAt = now()
      state.setupSessionHash = ''
      state.setupSessionIssuedAt = 0
      state.setupSessionExpiresAt = 0
      state.installCodeHash = ''
      state.installCodeExpiresAt = 0
      state.installCodeFailureCount = 0
      state.lastValidationMode = 'ready'
      state.lastValidationError = ''
      this.runtimeInstallCode = ''
      this.runtimeSetupSession = ''
      this.clearTimers()
      await this.persistState(state)
      const snapshot = this.snapshot(state)
      for (const listener of this.listeners) {
        try {
          await listener(snapshot)
        } catch (error) {
          logger.warn(error, '[setup] setup completion listener failed')
        }
      }

      const userId = state.adminUserId > 0
        ? state.adminUserId
        : findFirstUser()?.id || 0
      const user = userId ? findUserById(userId) : null
      if (!user) {
        return {
          ok: false,
          status: 500,
          code: 'setup_complete_missing_admin',
          message: '安装已完成，但未找到管理员账户',
          setup: snapshot,
        }
      }

      const token = await issueUserJwt(user)
      return {
        ok: true,
        sessionToken: token,
        setup: snapshot,
      }
    })
  }

  async getSnapshot(): Promise<SetupStatusSnapshot> {
    return this.getStatus()
  }

  onComplete(listener: CompletionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async isSetupComplete(): Promise<boolean> {
    return (await this.getStatus()).setupComplete
  }

  getSetupSessionToken(): string {
    return this.runtimeSetupSession
  }
}

const manager = new SetupManager()

export function getSetupManager(): SetupManager {
  return manager
}

export async function getSetupStatus(): Promise<SetupStatusSnapshot> {
  return manager.getStatus()
}

export async function bootstrapSetup(code: string): Promise<SetupBootstrapResult | SetupFailureResult> {
  return manager.bootstrap(code)
}

export async function updateSetupAdmin(sessionToken: string, input: SetupAdminInput): Promise<SetupValidationResult | SetupFailureResult> {
  return manager.updateAdmin(sessionToken, input)
}

export async function updateSetupModel(sessionToken: string, input: SetupModelInput): Promise<SetupValidationResult | SetupFailureResult> {
  return manager.updateModel(sessionToken, input)
}

export async function updateSetupGateway(sessionToken: string, input: SetupGatewayInput): Promise<SetupValidationResult | SetupFailureResult> {
  return manager.updateGateway(sessionToken, input)
}

export async function validateSetup(sessionToken: string): Promise<SetupValidationResult | SetupFailureResult> {
  return manager.validate(sessionToken)
}

export async function completeSetup(sessionToken: string): Promise<SetupBootstrapResult | SetupFailureResult> {
  return manager.complete(sessionToken)
}

export function onSetupComplete(listener: CompletionListener): () => void {
  return manager.onComplete(listener)
}

export async function isSetupComplete(): Promise<boolean> {
  return manager.isSetupComplete()
}

export function setupSessionTokenHeader(): string {
  return SETUP_SESSION_HEADER
}

export function createSetupRequiredError(): Error {
  const error = new Error('setup_required')
  ;(error as Error & { data?: Record<string, unknown> }).data = {
    error: 'setup_required',
    code: 'setup_required',
    status: 428,
    requiresSetup: true,
    setupComplete: false,
  }
  return error
}

export function setupRequiredResponseBody(): Record<string, unknown> {
  return {
    error: 'setup_required',
    code: 'setup_required',
    requiresSetup: true,
    setupComplete: false,
  }
}

export function writeSetupRequiredUpgrade(socket: Duplex): void {
  const body = JSON.stringify(setupRequiredResponseBody())
  socket.write(
    'HTTP/1.1 428 Precondition Required\r\n'
    + 'Content-Type: application/json\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n`
    + 'Connection: close\r\n'
    + '\r\n'
    + body,
  )
  socket.destroy()
}

export async function requireSetupComplete(ctx: Context, next: Next): Promise<void> {
  if (!ctx.path.startsWith('/api') && !ctx.path.startsWith('/v1')) {
    await next()
    return
  }
  if (setupBypassPath(ctx.path)) {
    await next()
    return
  }
  if (!await isSetupComplete()) {
    ctx.status = 428
    ctx.body = setupRequiredResponseBody()
    return
  }
  await next()
}

export function getSetupSessionHeader(ctx: Context): string {
  return requestHeader(ctx, SETUP_SESSION_HEADER)
}
