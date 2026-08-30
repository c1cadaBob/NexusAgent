<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NCheckbox, NInput, NSelect, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { setApiKey } from '@/api/client'
import type { UserThemeSettings } from '@/api/studio/theme'
import { resolveLoginRedirect } from '@/utils/login-redirect'
import { useTheme } from '@/composables/useTheme'
import { useSetupStore } from '@/stores/hermes/setup'

type SetupStepKey = 'bootstrap' | 'admin' | 'model' | 'gateway' | 'validate' | 'complete'

const stepOrder: SetupStepKey[] = ['bootstrap', 'admin', 'model', 'gateway', 'validate', 'complete']
const gatewayRecommendedPlatforms = ['Telegram', 'Discord', 'Slack']
const gatewayAdvancedPlatforms = ['Webhook', 'WhatsApp Cloud', 'Microsoft Graph', 'API Server']

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const message = useMessage()
const setup = useSetupStore()
const { activateUserTheme } = useTheme()

const currentStep = ref<SetupStepKey>('bootstrap')
const setupTitle = computed(() => t('setup.title'))
const setupSubtitle = computed(() => t('setup.subtitle'))
const redirectTarget = computed(() => resolveLoginRedirect(route.query.redirect))
const currentProviderOption = computed(() =>
  setup.providerOptions.find(option => option.provider === setup.selectedProvider) || null,
)
const currentModelOptions = computed(() => currentProviderOption.value?.models || [])
const selectedModelExistsInOptions = computed(() =>
  currentModelOptions.value.length === 0 || currentModelOptions.value.includes(setup.selectedModel),
)
const validationFailed = computed(() => setup.status?.lastValidationMode === 'failed')
const summaryItems = computed(() => [
  { key: 'bootstrap' as const, done: setup.status?.steps.bootstrap.done ?? false, label: t('setup.steps.bootstrap') },
  { key: 'admin' as const, done: setup.status?.steps.admin.done ?? false, label: t('setup.steps.admin') },
  { key: 'model' as const, done: setup.status?.steps.model.done ?? false, label: t('setup.steps.model') },
  { key: 'gateway' as const, done: setup.status?.steps.gateway.done ?? false, label: t('setup.steps.gateway') },
  { key: 'validate' as const, done: setup.status?.steps.validate.done ?? false, label: t('setup.steps.validate') },
  { key: 'complete' as const, done: setup.status?.steps.complete.done ?? false, label: t('setup.steps.complete') },
])

function stepIndex(step: SetupStepKey): number {
  return stepOrder.indexOf(step)
}

function canOpenStep(step: SetupStepKey): boolean {
  if (step === 'bootstrap') return true
  const snapshot = setup.status?.steps[step]
  if (snapshot?.done) return true
  return stepIndex(step) <= stepIndex(currentStep.value)
}

function selectStep(step: SetupStepKey): void {
  if (!canOpenStep(step)) return
  currentStep.value = step
}

function advanceStep(step: SetupStepKey): void {
  if (stepIndex(step) > stepIndex(currentStep.value)) {
    currentStep.value = step
  }
}

async function handleBootstrap(): Promise<void> {
  const result = await setup.bootstrap()
  if (!result) return
  advanceStep('admin')
}

async function handleAdmin(): Promise<void> {
  const ok = await setup.saveAdminStep()
  if (ok) advanceStep('model')
}

async function handleModel(): Promise<void> {
  const ok = await setup.saveModelStep()
  if (ok) advanceStep('gateway')
}

async function handleGateway(): Promise<void> {
  const ok = await setup.saveGatewayStep()
  if (ok) advanceStep('validate')
}

async function handleValidate(): Promise<void> {
  const ok = await setup.validate()
  if (ok) advanceStep('complete')
}

async function handleComplete(): Promise<void> {
  const result = await setup.complete()
  if (!result) return
  setApiKey(result.token)
  if (result.theme) {
    activateUserTheme(result.userId, result.theme as UserThemeSettings)
  }
  message.success(t('setup.completeSuccess'))
  await router.replace(redirectTarget.value)
}

watch(
  () => setup.activeStep,
  (next) => {
    if (stepIndex(next) > stepIndex(currentStep.value)) {
      currentStep.value = next
    }
    if (stepIndex(currentStep.value) === -1) {
      currentStep.value = next
    }
  },
  { immediate: true },
)

watch(
  () => setup.selectedProvider,
  (provider) => {
    const option = setup.providerOptions.find(item => item.provider === provider)
    if (!option) return
    if (!setup.selectedBaseUrl) setup.selectedBaseUrl = option.baseUrl || ''
    if (option.models.length > 0 && !option.models.includes(setup.selectedModel)) {
      setup.selectedModel = option.models[0] || ''
    }
  },
  { immediate: true },
)

watch(
  () => setup.modelOptions,
  (options) => {
    if (options.length > 0 && !options.includes(setup.selectedModel)) {
      setup.selectedModel = options[0]
    }
  },
  { immediate: true },
)

onMounted(() => {
  void setup.loadStatus().then((snapshot) => {
    if (snapshot?.setupComplete) {
      void router.replace(redirectTarget.value)
    }
  })
})
</script>

<template>
  <div class="setup-page">
    <div class="setup-grid">
      <aside class="setup-rail">
        <div class="setup-brand">
          <div class="setup-brand__name">{{ setupTitle }}</div>
          <div class="setup-brand__meta">{{ setupSubtitle }}</div>
        </div>
        <nav class="setup-steps" aria-label="Setup steps">
          <button
            v-for="step in summaryItems"
            :key="step.key"
            type="button"
            class="setup-step"
            :class="{
              active: currentStep === step.key,
              done: step.done,
            }"
            :disabled="!canOpenStep(step.key)"
            @click="selectStep(step.key)"
          >
            <span class="setup-step__index">{{ String(stepOrder.indexOf(step.key) + 1).padStart(2, '0') }}</span>
            <span class="setup-step__label">{{ step.label }}</span>
          </button>
        </nav>
        <div class="setup-rail__summary">
          <div class="setup-rail__summary-label">{{ t('setup.stateLabel') }}</div>
          <div class="setup-rail__summary-value">
            {{ setup.status?.setupComplete ? t('setup.stateComplete') : t('setup.statePending') }}
          </div>
          <div
            v-if="setup.status?.migrationState"
            class="setup-rail__summary-note"
          >
            {{ t(`setup.migration.${setup.status.migrationState}`) }}
          </div>
        </div>
      </aside>

      <main class="setup-panel">
        <header class="setup-panel__header">
          <div>
            <div class="setup-panel__eyebrow">{{ t('setup.eyebrow') }}</div>
            <h1 class="setup-panel__title">{{ t(`setup.steps.${currentStep}`) }}</h1>
            <p class="setup-panel__description">
              {{ t(`setup.descriptions.${currentStep}`) }}
            </p>
          </div>
          <div class="setup-panel__status">
            <span>{{ t('setup.sessionLabel') }}</span>
            <strong>{{ setup.sessionToken ? t('setup.sessionActive') : t('setup.sessionIdle') }}</strong>
          </div>
        </header>

        <NAlert v-if="setup.stepError" type="error" :show-icon="false" class="setup-alert">
          {{ setup.stepError }}
        </NAlert>
        <NAlert v-else-if="validationFailed && setup.status?.lastValidationError" type="warning" :show-icon="false" class="setup-alert">
          {{ setup.status.lastValidationError }}
        </NAlert>
        <NAlert v-else-if="setup.status?.migrationState && setup.status.migrationState !== 'fresh'" type="info" :show-icon="false" class="setup-alert">
          {{ t(`setup.migration.${setup.status.migrationState}`) }}
        </NAlert>

        <section v-if="currentStep === 'bootstrap'" class="setup-section">
          <div class="setup-field">
            <label class="setup-label" for="install-code">{{ t('setup.installCode') }}</label>
            <NInput
              id="install-code"
              v-model:value="setup.installCode"
              :placeholder="t('setup.installCodePlaceholder')"
              autocapitalize="off"
              autocomplete="one-time-code"
              spellcheck="false"
            />
            <div class="setup-help">
              {{ t('setup.installCodeHelp') }}
            </div>
          </div>
          <div class="setup-actions">
            <NButton type="primary" :loading="setup.bootstrapping" :disabled="!setup.canBootstrap" @click="handleBootstrap">
              {{ t('setup.start') }}
            </NButton>
          </div>
        </section>

        <section v-else-if="currentStep === 'admin'" class="setup-section">
          <div class="setup-field">
            <label class="setup-label" for="setup-username">{{ t('setup.adminUsername') }}</label>
            <NInput
              id="setup-username"
              v-model:value="setup.adminUsername"
              :placeholder="t('setup.adminUsernamePlaceholder')"
              autocomplete="username"
              spellcheck="false"
            />
          </div>
          <div class="setup-field">
            <label class="setup-label" for="setup-password">{{ t('setup.adminPassword') }}</label>
            <NInput
              id="setup-password"
              v-model:value="setup.adminPassword"
              type="password"
              show-password-on="click"
              :placeholder="t('setup.adminPasswordPlaceholder')"
              autocomplete="new-password"
            />
          </div>
          <div class="setup-actions">
            <NButton type="primary" :loading="setup.savingAdmin" :disabled="!setup.canSubmitAdmin" @click="handleAdmin">
              {{ t('common.save') }}
            </NButton>
          </div>
        </section>

        <section v-else-if="currentStep === 'model'" class="setup-section">
          <div class="setup-field">
            <label class="setup-label" for="setup-provider">{{ t('setup.provider') }}</label>
            <NSelect
              id="setup-provider"
              v-model:value="setup.selectedProvider"
              :options="setup.providerOptions.map(option => ({ label: option.label, value: option.provider }))"
              :placeholder="t('setup.providerPlaceholder')"
            />
            <div class="setup-help" v-if="currentProviderOption">
              {{ currentProviderOption.label }} · {{ currentProviderOption.baseUrl }}
            </div>
          </div>
          <div class="setup-field">
            <label class="setup-label" for="setup-model">{{ t('setup.model') }}</label>
            <NSelect
              v-if="currentModelOptions.length > 0"
              id="setup-model"
              v-model:value="setup.selectedModel"
              :options="currentModelOptions.map(model => ({ label: model, value: model }))"
              :placeholder="t('setup.modelPlaceholder')"
            />
            <NInput
              v-else
              id="setup-model"
              v-model:value="setup.selectedModel"
              :placeholder="t('setup.modelPlaceholder')"
              spellcheck="false"
            />
          </div>
          <div class="setup-field">
            <label class="setup-label" for="setup-base-url">{{ t('setup.baseUrl') }}</label>
            <NInput
              id="setup-base-url"
              v-model:value="setup.selectedBaseUrl"
              :placeholder="currentProviderOption?.baseUrl || t('setup.baseUrlPlaceholder')"
              spellcheck="false"
            />
            <div class="setup-help">
              {{ t('setup.baseUrlHelp') }}
            </div>
          </div>
          <div class="setup-field">
            <label class="setup-label" for="setup-api-key">{{ t('setup.apiKey') }}</label>
            <NInput
              id="setup-api-key"
              v-model:value="setup.selectedApiKey"
              type="password"
              show-password-on="click"
              :placeholder="t('setup.apiKeyPlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <div class="setup-actions">
            <NButton type="primary" :loading="setup.savingModel" :disabled="!setup.canSubmitModel || !selectedModelExistsInOptions" @click="handleModel">
              {{ t('common.save') }}
            </NButton>
          </div>
        </section>

        <section v-else-if="currentStep === 'gateway'" class="setup-section">
          <div class="setup-field">
            <label class="setup-toggle">
              <NCheckbox v-model:checked="setup.enableGateway">
                {{ t('setup.gatewayEnable') }}
              </NCheckbox>
            </label>
            <div class="setup-help">
              {{ t('setup.gatewayHelp') }}
            </div>
          </div>

          <div v-if="setup.enableGateway" class="setup-field">
            <div class="setup-label">{{ t('setup.platforms') }}</div>
            <div class="setup-platform-groups">
              <label v-for="platform in gatewayRecommendedPlatforms" :key="platform" class="setup-platform">
                <NCheckbox
                  :checked="setup.gatewayPlatforms.includes(platform)"
                  @update:checked="value => setup.setGatewayPlatform(platform, value)"
                >
                  {{ platform }}
                </NCheckbox>
              </label>
            </div>
            <details class="setup-details">
              <summary>{{ t('setup.morePlatforms') }}</summary>
              <div class="setup-platform-groups setup-platform-groups--advanced">
                <label v-for="platform in gatewayAdvancedPlatforms" :key="platform" class="setup-platform">
                  <NCheckbox
                    :checked="setup.gatewayPlatforms.includes(platform)"
                    @update:checked="value => setup.setGatewayPlatform(platform, value)"
                  >
                    {{ platform }}
                  </NCheckbox>
                </label>
              </div>
            </details>
          </div>

          <div class="setup-actions">
            <NButton type="primary" :loading="setup.savingGateway" :disabled="!setup.canSubmitGateway" @click="handleGateway">
              {{ setup.enableGateway ? t('common.save') : t('setup.skipGateway') }}
            </NButton>
          </div>
        </section>

        <section v-else-if="currentStep === 'validate'" class="setup-section">
          <div class="setup-checklist">
            <div class="setup-checklist__item">
              <span class="setup-checklist__label">{{ t('setup.steps.admin') }}</span>
              <span class="setup-checklist__value">{{ setup.status?.adminConfigured ? t('common.saved') : t('common.notConfigured') }}</span>
            </div>
            <div class="setup-checklist__item">
              <span class="setup-checklist__label">{{ t('setup.steps.model') }}</span>
              <span class="setup-checklist__value">{{ setup.status?.modelReady ? t('common.configured') : t('common.notConfigured') }}</span>
            </div>
            <div class="setup-checklist__item">
              <span class="setup-checklist__label">{{ t('setup.steps.gateway') }}</span>
              <span class="setup-checklist__value">{{ setup.status?.gatewayConfigured ? t('common.configured') : t('common.notConfigured') }}</span>
            </div>
          </div>
          <div class="setup-actions">
            <NButton type="primary" :loading="setup.validating" @click="handleValidate">
              {{ t('setup.validate') }}
            </NButton>
          </div>
        </section>

        <section v-else class="setup-section">
          <div class="setup-complete">
            <div class="setup-complete__title">{{ t('setup.completeTitle') }}</div>
            <p class="setup-complete__body">{{ t('setup.completeBody') }}</p>
          </div>
          <div class="setup-actions">
            <NButton type="primary" :loading="setup.completing" @click="handleComplete">
              {{ t('setup.enterChat') }}
            </NButton>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.setup-page {
  min-height: calc(100 * var(--vh));
  background-color: #ffffff;
  color: #111111;
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
  background-size: 64px 64px;
}

.setup-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  min-height: calc(100 * var(--vh));
}

.setup-rail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px 24px;
  border-right: 1px solid rgba(17, 17, 17, 0.12);
  background: rgba(255, 255, 255, 0.84);
}

.setup-brand {
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(17, 17, 17, 0.12);
}

.setup-brand__name {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: 0;
}

.setup-brand__meta {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(17, 17, 17, 0.64);
}

.setup-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setup-step {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.setup-step:disabled {
  cursor: default;
  opacity: 0.55;
}

.setup-step.active {
  border-color: rgba(228, 0, 43, 0.35);
  background: rgba(228, 0, 43, 0.06);
}

.setup-step.done .setup-step__index {
  border-color: #111111;
  background: #111111;
  color: #ffffff;
}

.setup-step__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(17, 17, 17, 0.2);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  letter-spacing: 0;
}

.setup-step__label {
  font-size: 14px;
  line-height: 1.4;
  text-transform: uppercase;
  letter-spacing: 0;
}

.setup-rail__summary {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid rgba(17, 17, 17, 0.12);
}

.setup-rail__summary-label {
  font-size: 12px;
  color: rgba(17, 17, 17, 0.56);
  text-transform: uppercase;
}

.setup-rail__summary-value {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 600;
}

.setup-rail__summary-note {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(17, 17, 17, 0.62);
}

.setup-panel {
  padding: 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setup-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(17, 17, 17, 0.12);
}

.setup-panel__eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  color: rgba(17, 17, 17, 0.56);
}

.setup-panel__title {
  margin: 8px 0 0;
  font-size: 32px;
  line-height: 1.1;
  font-weight: 600;
}

.setup-panel__description {
  margin: 10px 0 0;
  max-width: 62ch;
  color: rgba(17, 17, 17, 0.68);
  line-height: 1.6;
}

.setup-panel__status {
  min-width: 180px;
  padding-top: 4px;
  text-align: right;
  font-size: 13px;
  color: rgba(17, 17, 17, 0.66);
}

.setup-panel__status strong {
  display: block;
  margin-top: 8px;
  font-size: 16px;
  color: #111111;
}

.setup-alert {
  border-radius: 0;
}

.setup-section {
  display: grid;
  gap: 20px;
  max-width: 760px;
}

.setup-field {
  display: grid;
  gap: 8px;
}

.setup-label {
  font-size: 13px;
  text-transform: uppercase;
  color: rgba(17, 17, 17, 0.7);
}

.setup-help {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(17, 17, 17, 0.58);
}

.setup-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.setup-platform-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 16px;
}

.setup-platform-groups--advanced {
  margin-top: 12px;
}

.setup-platform {
  display: block;
  padding: 8px 0;
}

.setup-details {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(17, 17, 17, 0.12);
}

.setup-details summary {
  cursor: pointer;
  font-size: 12px;
  text-transform: uppercase;
  color: rgba(17, 17, 17, 0.68);
}

.setup-checklist {
  display: grid;
  gap: 12px;
  max-width: 520px;
}

.setup-checklist__item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(17, 17, 17, 0.12);
}

.setup-checklist__label {
  font-size: 14px;
  color: rgba(17, 17, 17, 0.7);
}

.setup-checklist__value {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: #111111;
}

.setup-complete {
  display: grid;
  gap: 10px;
  max-width: 560px;
}

.setup-complete__title {
  font-size: 24px;
  font-weight: 600;
}

.setup-complete__body {
  margin: 0;
  color: rgba(17, 17, 17, 0.68);
  line-height: 1.6;
}

.setup-actions {
  display: flex;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(17, 17, 17, 0.12);
}

@media (max-width: 980px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }

  .setup-rail {
    border-right: none;
    border-bottom: 1px solid rgba(17, 17, 17, 0.12);
  }

  .setup-panel {
    padding: 24px;
  }

  .setup-panel__header {
    flex-direction: column;
  }

  .setup-panel__status {
    text-align: left;
  }
}

@media (max-width: $breakpoint-mobile) {
  .setup-page {
    background-size: 48px 48px;
  }

  .setup-brand__name {
    font-size: 24px;
  }

  .setup-panel__title {
    font-size: 28px;
  }
}
</style>
