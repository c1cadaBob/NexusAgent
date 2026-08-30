import { request } from '../client'

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

export interface SetupStatus {
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

export interface SetupBootstrapResponse {
  sessionToken: string
  setup: SetupStatus
}

export interface SetupCompleteResponse {
  token: string
  userId: number
  profiles: string[]
  theme: unknown
  setup: SetupStatus
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

export interface SetupValidationChecks {
  admin: boolean
  model: boolean
  gateway: boolean
}

export interface SetupValidationResponse {
  ok: boolean
  message: string
  setup: SetupStatus
  checks: SetupValidationChecks
}

export interface SetupFailureResponse {
  ok: false
  status: number
  code: string
  message: string
  setup: SetupStatus
}

function setupHeaders(sessionToken?: string): Record<string, string> {
  return sessionToken ? { 'x-hermes-setup-session': sessionToken } : {}
}

async function setupRequest<T>(path: string, sessionToken: string | undefined, options: RequestInit = {}): Promise<T> {
  return request<T>(path, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...setupHeaders(sessionToken),
    },
  })
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>('/api/setup/status')
}

export async function bootstrapSetup(code: string): Promise<SetupBootstrapResponse> {
  return request<SetupBootstrapResponse>('/api/setup/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function saveSetupAdmin(sessionToken: string, input: SetupAdminInput): Promise<SetupValidationResponse | SetupFailureResponse> {
  return setupRequest('/api/setup/admin', sessionToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function saveSetupModel(sessionToken: string, input: SetupModelInput): Promise<SetupValidationResponse | SetupFailureResponse> {
  return setupRequest('/api/setup/model', sessionToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function saveSetupGateway(sessionToken: string, input: SetupGatewayInput): Promise<SetupValidationResponse | SetupFailureResponse> {
  return setupRequest('/api/setup/gateway', sessionToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function validateSetup(sessionToken: string): Promise<SetupValidationResponse | SetupFailureResponse> {
  return setupRequest('/api/setup/validate', sessionToken, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function completeSetup(sessionToken: string): Promise<SetupCompleteResponse | SetupFailureResponse> {
  return setupRequest('/api/setup/complete', sessionToken, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
