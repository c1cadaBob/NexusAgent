/** Shared agent-loop scheduler defaults.
 * @module dsh-agent-loop/constants
 */

/** Default maximum in-flight parallel-safe calls per agent step. */
export const DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10

/** NexusAgent P2 baseline executor provider pinned to the current vendor snapshot. */
export const NEXUS_DSH_DEFAULT_PROVIDER_ID = 'dsh-0.1.1-rc.2'

/** Enable executor-only mode inside the DSH vendor copy. */
export const NEXUS_DSH_EXECUTOR_ONLY_ENV = 'NEXUS_DSH_EXECUTOR_ONLY'

/** Platform execution context projected into the executor provider process. */
export const NEXUS_DSH_EXECUTION_ID_ENV = 'NEXUS_DSH_EXECUTION_ID'
export const NEXUS_DSH_TRACE_ID_ENV = 'NEXUS_DSH_TRACE_ID'
export const NEXUS_DSH_EXECUTION_POLICY_ENV = 'NEXUS_DSH_EXECUTION_POLICY'

/** Provider selection and rollback metadata projected by the platform adapter. */
export const NEXUS_DSH_PROVIDER_ID_ENV = 'NEXUS_DSH_PROVIDER_ID'
export const NEXUS_DSH_PROVIDER_ENABLED_ENV = 'NEXUS_DSH_PROVIDER_ENABLED'
export const NEXUS_DSH_ROLLBACK_PROVIDER_ID_ENV = 'NEXUS_DSH_ROLLBACK_PROVIDER_ID'

/** Platform cancellation projection used before starting native tool scheduling. */
export const NEXUS_DSH_CANCEL_REQUESTED_ENV = 'NEXUS_DSH_CANCEL_REQUESTED'
export const NEXUS_DSH_CANCEL_REASON_ENV = 'NEXUS_DSH_CANCEL_REASON'
