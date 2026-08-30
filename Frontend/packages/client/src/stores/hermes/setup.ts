import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  bootstrapSetup,
  completeSetup,
  fetchSetupStatus,
  saveSetupAdmin,
  saveSetupGateway,
  saveSetupModel,
  validateSetup,
  type SetupBootstrapResponse,
  type SetupCompleteResponse,
  type SetupGatewayInput,
  type SetupModelInput,
  type SetupStatus,
} from '@/api/studio/setup'

const SETUP_SESSION_STORAGE_KEY = 'hermes_setup_session_token'
const DEFAULT_PROVIDER = ''
const DEFAULT_MODEL = ''

function readStoredSessionToken(): string {
  try {
    return sessionStorage.getItem(SETUP_SESSION_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writeStoredSessionToken(value: string): void {
  try {
    if (value) sessionStorage.setItem(SETUP_SESSION_STORAGE_KEY, value)
    else sessionStorage.removeItem(SETUP_SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures; the in-memory token still works for the current tab.
  }
}

export const useSetupStore = defineStore('setup', () => {
  const status = ref<SetupStatus | null>(null)
  const loading = ref(false)
  const bootstrapping = ref(false)
  const savingAdmin = ref(false)
  const savingModel = ref(false)
  const savingGateway = ref(false)
  const validating = ref(false)
  const completing = ref(false)
  const sessionToken = ref(readStoredSessionToken())
  const installCode = ref('')
  const adminUsername = ref('')
  const adminPassword = ref('')
  const selectedProvider = ref(DEFAULT_PROVIDER)
  const selectedModel = ref(DEFAULT_MODEL)
  const selectedBaseUrl = ref('')
  const selectedApiKey = ref('')
  const enableGateway = ref(false)
  const gatewayPlatforms = ref<string[]>([])
  const stepError = ref('')

  const providerOptions = computed(() => status.value?.providerOptions || [])
  const currentProviderOption = computed(() =>
    providerOptions.value.find(option => option.provider === selectedProvider.value)
      || providerOptions.value[0]
      || null,
  )
  const modelOptions = computed(() => currentProviderOption.value?.models || [])
  const setupComplete = computed(() => status.value?.setupComplete === true)
  const requiresSetup = computed(() => status.value?.requiresSetup !== false)
  const canBootstrap = computed(() => !!installCode.value.trim())
  const canSubmitAdmin = computed(() => adminUsername.value.trim().length >= 2 && adminPassword.value.length >= 6)
  const canSubmitModel = computed(() =>
    !!selectedProvider.value.trim() && !!selectedModel.value.trim(),
  )
  const canSubmitGateway = computed(() =>
    !enableGateway.value || gatewayPlatforms.value.length > 0,
  )
  const activeStep = computed(() => {
    if (!sessionToken.value) return 'bootstrap'
    if (!status.value?.adminConfigured) return 'admin'
    if (!status.value?.modelConfigured) return 'model'
    if (!status.value?.gatewayConfigured) return 'gateway'
    if (status.value?.lastValidationMode !== 'ready' || !status.value?.canComplete) return 'validate'
    return 'complete'
  })

  function applyStatus(next: SetupStatus | null): void {
    status.value = next
    if (!next) return
    if (next.setupComplete) {
      clearSessionToken()
      return
    }
    if (next.adminUsername && !adminUsername.value) {
      adminUsername.value = next.adminUsername
    }
    if (next.modelProvider) {
      selectedProvider.value = next.modelProvider
    } else if (!selectedProvider.value && providerOptions.value[0]) {
      selectedProvider.value = providerOptions.value[0].provider
    }
    if (next.modelName) {
      selectedModel.value = next.modelName
    } else if (!selectedModel.value && modelOptions.value[0]) {
      selectedModel.value = modelOptions.value[0]
    }
    if (next.gatewayPlatforms.length > 0 && gatewayPlatforms.value.length === 0) {
      gatewayPlatforms.value = [...next.gatewayPlatforms]
    }
    enableGateway.value = next.gatewayEnabled
    if (next.providerOptions.length > 0 && !selectedProvider.value) {
      selectedProvider.value = next.providerOptions[0].provider
      selectedModel.value = next.providerOptions[0].models[0] || ''
    }
  }

  function clearSessionToken(): void {
    sessionToken.value = ''
    writeStoredSessionToken('')
  }

  function setSessionToken(token: string): void {
    sessionToken.value = token
    writeStoredSessionToken(token)
  }

  async function loadStatus(force = false): Promise<SetupStatus | null> {
    if (!force && status.value) return status.value
    loading.value = true
    try {
      const next = await fetchSetupStatus()
      applyStatus(next)
      return next
    } catch (error: any) {
      stepError.value = error?.message || '加载安装状态失败'
      return null
    } finally {
      loading.value = false
    }
  }

  async function bootstrap(): Promise<SetupBootstrapResponse | null> {
    const code = installCode.value.trim()
    if (!code) return null
    bootstrapping.value = true
    stepError.value = ''
    try {
      const result = await bootstrapSetup(code)
      setSessionToken(result.sessionToken)
      applyStatus(result.setup)
      installCode.value = ''
      return result
    } catch (error: any) {
      stepError.value = error?.message || '验证安装码失败'
      return null
    } finally {
      bootstrapping.value = false
    }
  }

  async function saveAdminStep(): Promise<boolean> {
    if (!sessionToken.value) return false
    savingAdmin.value = true
    stepError.value = ''
    try {
      const result = await saveSetupAdmin(sessionToken.value, {
        username: adminUsername.value.trim(),
        password: adminPassword.value,
      })
      if (!result.ok) {
        stepError.value = result.message
        applyStatus(result.setup)
        return false
      }
      applyStatus(result.setup)
      adminPassword.value = ''
      return true
    } catch (error: any) {
      stepError.value = error?.message || '保存管理员信息失败'
      return false
    } finally {
      savingAdmin.value = false
    }
  }

  async function saveModelStep(): Promise<boolean> {
    if (!sessionToken.value) return false
    savingModel.value = true
    stepError.value = ''
    try {
      const payload: SetupModelInput = {
        profile: 'default',
        provider: selectedProvider.value.trim(),
        model: selectedModel.value.trim(),
        baseUrl: selectedBaseUrl.value.trim() || undefined,
        apiKey: selectedApiKey.value.trim() || undefined,
      }
      const result = await saveSetupModel(sessionToken.value, payload)
      if (!result.ok) {
        stepError.value = result.message
        applyStatus(result.setup)
        return false
      }
      applyStatus(result.setup)
      return true
    } catch (error: any) {
      stepError.value = error?.message || '保存模型配置失败'
      return false
    } finally {
      savingModel.value = false
    }
  }

  async function saveGatewayStep(): Promise<boolean> {
    if (!sessionToken.value) return false
    savingGateway.value = true
    stepError.value = ''
    try {
      const payload: SetupGatewayInput = {
        enabled: enableGateway.value,
        platforms: enableGateway.value ? [...gatewayPlatforms.value] : [],
      }
      const result = await saveSetupGateway(sessionToken.value, payload)
      if (!result.ok) {
        stepError.value = result.message
        applyStatus(result.setup)
        return false
      }
      applyStatus(result.setup)
      return true
    } catch (error: any) {
      stepError.value = error?.message || '保存网关配置失败'
      return false
    } finally {
      savingGateway.value = false
    }
  }

  async function validate(): Promise<boolean> {
    if (!sessionToken.value) return false
    validating.value = true
    stepError.value = ''
    try {
      const result = await validateSetup(sessionToken.value)
      if (!result.ok) {
        stepError.value = result.message
        applyStatus(result.setup)
        return false
      }
      applyStatus(result.setup)
      return true
    } catch (error: any) {
      stepError.value = error?.message || '验证安装配置失败'
      return false
    } finally {
      validating.value = false
    }
  }

  async function complete(): Promise<SetupCompleteResponse | null> {
    if (!sessionToken.value) return null
    completing.value = true
    stepError.value = ''
    try {
      const result = await completeSetup(sessionToken.value)
      if ('ok' in result && result.ok === false) {
        stepError.value = result.message
        applyStatus(result.setup)
        return null
      }
      const success = result as SetupCompleteResponse
      applyStatus(success.setup)
      clearSessionToken()
      return success
    } catch (error: any) {
      stepError.value = error?.message || '完成安装失败'
      return null
    } finally {
      completing.value = false
    }
  }

  function setGatewayPlatform(platform: string, enabled: boolean): void {
    const clean = platform.trim()
    if (!clean) return
    const next = new Set(gatewayPlatforms.value)
    if (enabled) next.add(clean)
    else next.delete(clean)
    gatewayPlatforms.value = [...next]
  }

  return {
    status,
    loading,
    bootstrapping,
    savingAdmin,
    savingModel,
    savingGateway,
    validating,
    completing,
    sessionToken,
    installCode,
    adminUsername,
    adminPassword,
    selectedProvider,
    selectedModel,
    selectedBaseUrl,
    selectedApiKey,
    enableGateway,
    gatewayPlatforms,
    stepError,
    providerOptions,
    currentProviderOption,
    modelOptions,
    setupComplete,
    requiresSetup,
    canBootstrap,
    canSubmitAdmin,
    canSubmitModel,
    canSubmitGateway,
    activeStep,
    loadStatus,
    bootstrap,
    saveAdminStep,
    saveModelStep,
    saveGatewayStep,
    validate,
    complete,
    setGatewayPlatform,
    clearSessionToken,
    setSessionToken,
  }
})
