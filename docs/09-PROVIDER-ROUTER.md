# 09 — PROVIDER ROUTER

**Forge Wanzz — AI Software Factory**  
**Version:** 0.1  
**Status:** Canonical Detailed Specification  
**Depends On:** 00 Product Thesis, 01 Master PRD, 02 System Architecture, 06.5 Architectural Decisions, 07 Runtime Engine, 08 Runtime Discovery

---

# 1. Purpose

The Provider Router is responsible for resolving **which Model Provider should supply inference for an execution**, based on task requirements, agent strategy, runtime capabilities, configured connections, project policy, availability, cost/quality preferences, and fallback rules.

The Provider Router exists because:

```text
Runtime ≠ Model
Model ≠ Provider
```

A Runtime provides an execution environment.

A Model provides intelligence/inference.

A Provider supplies access to a model.

Forge must preserve these boundaries so that changing a provider does not require rewriting Agents, Tasks, Orchestration, or Runtime adapters.

---

# 2. Core Definition

A **Provider** is an inference source or service through which Forge can access one or more Models.

Examples may include:

```text
Cloud AI Provider
Local Model Server
Self-hosted Inference Server
Runtime-embedded Provider
Compatible API Provider
```

The Provider Router determines which provider/model combination should satisfy a request.

It does not perform the actual runtime execution.

---

# 3. Provider Router Responsibilities

The Provider Router owns:

1. Provider registry integration.
2. Provider capability representation.
3. Model availability representation.
4. Provider/model candidate discovery from configured connections.
5. Provider/model selection.
6. Routing policy evaluation.
7. Fallback candidate evaluation.
8. Provider health information.
9. Provider availability evaluation.
10. Model compatibility evaluation.
11. Routing decision generation.
12. Routing decision explanation.
13. Provider routing events.
14. Provider routing diagnostics.

---

# 4. Provider Router Non-Responsibilities

The Provider Router does not own:

| Responsibility | Owner |
|---|---|
| Task state | Task Engine |
| Task scheduling | Orchestrator |
| Agent lifecycle | Agent Engine |
| Agent organization | Organization Manager |
| Runtime execution | Runtime Engine |
| Runtime discovery | Runtime Discovery |
| Tool execution | Tool Execution Engine |
| Credential storage | Auth & Connections |
| Security policy | Security Policy Authority |
| Capability authorization | Capability Resolver |
| Verification | Verification Engine |
| Human approval | Approval Manager |
| Project management | Project Manager |

Provider Router participates in these flows but does not replace their authority.

---

# 5. Fundamental Distinctions

Forge maintains:

```text
Provider
Model
Runtime
Agent
Task
Skill
Tool
Capability
Permission
Trust
Connection
Credential
```

These must remain separate.

---

# 6. Provider vs Model

Example:

```text
Provider:
Anthropic

Model:
Claude-family model
```

A provider may expose multiple models.

A model may be available through multiple compatible providers.

Therefore:

```text
Provider 1
 ├── Model A
 └── Model B

Provider 2
 ├── Model A
 └── Model C
```

Model identity and provider identity must not be treated as the same object.

---

# 7. Provider vs Runtime

Example:

```text
Runtime:
External coding CLI

Provider:
Cloud inference service
```

A runtime may internally select a provider.

Forge must distinguish:

```text
Forge-controlled provider routing
```

from:

```text
provider selection performed internally by an opaque runtime
```

If Forge cannot control internal provider selection, it must not claim that it does.

---

# 8. Provider vs Connection

A Provider describes an inference source.

A Connection represents a configured way to access that provider.

Example:

```text
Provider:
Provider A

Connection:
User's configured account/endpoint
```

Credential management belongs to Auth & Connections.

---

# 9. Provider vs Credential

Provider:

```text
"What service is this?"
```

Credential:

```text
"How may this installation authenticate to it?"
```

The Provider Router may consume an authorized connection reference.

It must not become the raw credential store.

---

# 10. Provider Registry

The Provider Registry represents providers known to Forge.

Conceptually:

```yaml
provider:
  id:
  name:
  type:
  endpoint:
  capabilities:
  models:
  connection:
  health:
  status:
  metadata:
```

Provider metadata may be:

```text
configured
discovered
declared
observed
unknown
```

---

# 11. Provider Identity

A Provider should have a stable identity independent of display name.

Example:

```text
provider_id:
anthropic
```

or:

```text
provider_id:
local-ollama
```

Display names may change.

Stable IDs should not.

---

# 12. Provider Types

Potential provider types include:

```text
CLOUD
LOCAL
SELF_HOSTED
COMPATIBLE_API
RUNTIME_EMBEDDED
CUSTOM
```

Provider type describes how inference is supplied.

It is not a security classification.

---

# 13. Model Registry

Forge should maintain normalized model metadata.

Conceptually:

```yaml
model:
  id:
  provider_id:
  name:
  family:
  context_window:
  capabilities:
  modalities:
  tool_calling:
  structured_output:
  streaming:
  status:
```

Model metadata may vary by provider.

Unknown properties must remain unknown.

---

# 14. Model Identity

Model identity should distinguish:

```text
canonical model ID
provider-specific model ID
display name
model family
version/revision where available
```

A provider-specific model identifier should not automatically become Forge's global canonical identity.

---

# 15. Model Capabilities

Model capabilities may include:

```text
reasoning
code_generation
tool_calling
structured_output
streaming
vision
audio
long_context
multimodal
```

Capabilities describe technical support.

They do not grant Agent permissions.

---

# 16. Model Requirements

A Task or Agent may express model requirements.

Example:

```yaml
model_requirements:
  capabilities:
    - code_generation
    - tool_calling

  context_window:
    minimum: 100000

  structured_output:
    required: true
```

Provider Router uses these requirements during candidate selection.

---

# 17. Provider Requirements

A project or policy may require:

```text
specific provider
approved provider list
local-only inference
cloud-only inference
specific region
specific endpoint
```

These requirements must be respected.

Provider Router cannot override Security Policy or Project Policy.

---

# 18. Routing Input

A routing request may contain:

```yaml
routing_request:
  project_id:
  task_id:
  agent_id:
  runtime_id:
  requested_model:
  model_requirements:
  provider_requirements:
  capabilities:
  quality_profile:
  latency_profile:
  cost_profile:
  locality_requirement:
  trust_requirement:
  security_requirement:
  fallback_policy:
  connection_policy:
```

Not every field is mandatory.

---

# 19. Routing Output

A routing decision may contain:

```yaml
routing_decision:
  decision_id:
  provider_id:
  model_id:
  connection_id:
  rationale:
  candidate_evaluation:
  policy_result:
  health:
  fallback_candidates:
  expires_at:
```

The decision explains the selected provider/model.

It does not authorize arbitrary execution.

---

# 20. Routing vs Authorization

Provider selection is not authorization.

Conceptually:

```text
Provider Router
     ↓
Candidate / Selected Provider
     ↓
Capability Resolver
     ↓
Execution Authorization
```

A provider can be selected but still fail authorization.

---

# 21. Routing Lifecycle

```text
REQUESTED
   ↓
VALIDATING
   ↓
CANDIDATES_DISCOVERED
   ↓
FILTERING
   ↓
SCORING
   ↓
SELECTED
   ↓
RESOLVED
```

Failure:

```text
NO_CANDIDATE
UNAVAILABLE
POLICY_DENIED
CONNECTION_INVALID
CAPABILITY_MISMATCH
```

---

# 22. Candidate Discovery

Provider Router builds a candidate set from:

```text
configured providers
available connections
model registry
provider health
project policy
agent strategy
runtime capabilities
```

The candidate set should be explicit enough to explain why a provider was selected or rejected.

---

# 23. Candidate Filtering

Candidates may be removed because of:

```text
unsupported model
missing capability
unavailable connection
policy restriction
security restriction
unsupported runtime integration
locality requirement
trust requirement
disabled provider
health failure
```

Filtering occurs before final selection.

---

# 24. Candidate Scoring

After hard requirements are satisfied, candidates may be scored.

Potential factors:

```text
quality
latency
cost
availability
context capacity
model capability
locality
user preference
project preference
historical reliability
```

Scoring must never override hard security or capability requirements.

---

# 25. Hard Constraints vs Preferences

Example:

```text
Required:
tool_calling = true

Preferred:
low cost
```

A cheap model without tool calling must be rejected.

A slightly more expensive model with required capabilities may be selected.

---

# 26. Routing Policy

Routing policy may define:

```yaml
routing_policy:
  allowed_providers:
    - provider-a
    - provider-b

  preferred_models:
    - model-x

  fallback:
    enabled: true

  local_preference: false
  cost_weight:
  latency_weight:
  quality_weight:
```

Policy evaluation must remain deterministic given the same inputs and current provider state.

---

# 27. Provider Priority

Projects may define provider priority:

```text
1. Preferred Provider
2. Approved Alternative
3. Local Fallback
```

Priority is a routing preference.

It cannot override policy denial.

---

# 28. Model Priority

Similarly:

```text
1. Preferred Model
2. Compatible Model
3. Fallback Model
```

Every fallback must satisfy required capabilities.

---

# 29. Local-First Routing

Forge may support local-first policies:

```text
Local model
    ↓
Self-hosted model
    ↓
Approved cloud provider
```

This may be useful for:

- privacy
- cost
- offline development
- latency

The actual policy is configurable.

---

# 30. Cloud-First Routing

Projects may instead prefer:

```text
Approved cloud provider
    ↓
Alternative cloud provider
    ↓
Local fallback
```

Again, this is a policy choice.

---

# 31. Provider Health

Provider health may be represented as:

```text
UNKNOWN
AVAILABLE
DEGRADED
UNAVAILABLE
AUTH_REQUIRED
RATE_LIMITED
MISCONFIGURED
```

Health is an observation.

It does not automatically authorize use.

---

# 32. Provider Availability

Availability can differ from health.

Example:

```text
Provider:
configured = true
connection = valid
health = unavailable
```

or:

```text
Provider:
healthy = true
policy = denied
```

The Router must preserve these distinctions.

---

# 33. Connection Validation

Before selecting a provider that requires authentication, the Router should confirm that an appropriate connection exists.

It may consume:

```text
connection status
credential validity state
endpoint
scope
```

from Auth & Connections.

It must not access raw credentials unnecessarily.

---

# 34. Authentication Failure

If a provider requires authentication and the connection is invalid:

```text
candidate:
REJECTED
reason:
CONNECTION_INVALID
```

The Router should not expose the underlying secret.

---

# 35. Rate Limits

Providers may impose rate limits.

Provider metadata may include:

```text
rate limit state
remaining capacity
reset time
```

where available.

The Router may consider rate-limit state during candidate selection.

It must not promise capacity it cannot observe.

---

# 36. Cost Awareness

Provider Router may consider cost preferences.

Example:

```yaml
cost_profile:
  priority: low_cost
  max_cost_per_execution:
```

Cost data may be approximate.

The system must distinguish:

```text
estimated cost
actual cost
unknown cost
```

Actual billing authority remains external to Forge.

---

# 37. Token / Usage Estimation

The Router may use:

```text
estimated input tokens
estimated output tokens
context size
historical usage
```

to evaluate candidates.

It must not treat estimates as billing truth.

---

# 38. Latency Awareness

Latency may be represented as:

```text
estimated
historical
observed
unknown
```

The Router can use this information for preferences.

Latency is not a hard guarantee unless enforced by policy and infrastructure.

---

# 39. Quality Profile

A task may express:

```yaml
quality_profile:
  reasoning: high
  coding: high
  reliability: high
```

The exact scoring system may evolve.

V0.1 should avoid overcomplicated scoring unless required.

---

# 40. Provider Fallback

Fallback occurs when the selected provider cannot safely satisfy the request.

Example:

```text
Provider A
 ↓
Unavailable
 ↓
Provider B
 ↓
Capability validation
 ↓
Policy validation
 ↓
Execution
```

Fallback must be explicit and auditable.

---

# 41. No Silent Provider Downgrade

A fallback must not silently reduce:

```text
required model capability
security requirements
locality requirements
context requirements
tool-calling requirements
structured-output requirements
```

If a meaningful policy/security downgrade is unavoidable, approval may be required.

---

# 42. Model Fallback

Model fallback follows the same principle.

```text
Preferred Model
 ↓
Unavailable
 ↓
Compatible Model
 ↓
Validate requirements
 ↓
Select
```

A fallback model must satisfy hard requirements.

---

# 43. Provider + Runtime Compatibility

Some runtimes may support only certain provider modes.

Example:

```text
Runtime A:
supports provider configuration

Runtime B:
provider selection internal to CLI
```

Provider Router must account for this.

If a runtime does not expose provider selection to Forge, the Router cannot claim to have selected the internal provider.

---

# 44. Runtime-Embedded Provider

An opaque runtime may internally manage its provider.

In that case:

```text
Forge Provider Router:
provider control = unavailable

Runtime:
provider selection = internal
```

Forge records the limitation rather than fabricating provider control.

---

# 45. Provider Routing with Native Runtime

For a Forge-controlled runtime:

```text
Agent
 ↓
Provider Router
 ↓
Provider + Model
 ↓
Native Runtime
 ↓
Inference
```

Forge can generally exercise stronger control over the selected configuration.

Actual implementation guarantees depend on the runtime.

---

# 46. Provider Routing with External CLI

For an external CLI:

```text
Agent
 ↓
Provider Router
 ↓
Runtime Adapter
 ↓
External CLI
 ↓
Internal Provider Selection
```

If the CLI accepts provider/model configuration, Forge may pass it.

If it does not, provider routing may remain partially or fully outside Forge control.

---

# 47. Provider Capability Matrix

A normalized capability matrix may look like:

```text
Provider
 ├── Model A
 │    ├── tool_calling
 │    ├── streaming
 │    └── long_context
 │
 └── Model B
      ├── streaming
      └── vision
```

This enables capability-based routing.

---

# 48. Provider Registry Synchronization

Provider metadata may originate from:

```text
configuration
provider APIs
model catalogs
runtime metadata
local inference server
manual configuration
```

The Router consumes normalized registry state.

Discovery of local runtimes remains the responsibility of Runtime Discovery.

---

# 49. Provider Discovery Boundary

Provider discovery may be implemented separately where required.

This document does not define a complete Provider Discovery subsystem.

Provider Router may consume provider/model metadata from:

```text
configured registry
Auth & Connections
provider adapters
local provider detection
```

Future provider discovery can be added without changing the core routing contract.

---

# 50. Provider Adapter

A provider adapter may expose:

```ts
interface ProviderAdapter {
  id: string

  validateConnection(): Promise<ConnectionStatus>

  listModels?(): Promise<ModelInfo[]>

  getModel?(modelId: string): Promise<ModelInfo>

  healthCheck?(): Promise<HealthStatus>

  estimateCost?(
    request: CostEstimationRequest
  ): Promise<CostEstimate>
}
```

The adapter must not:

- mutate Task state
- grant permissions
- decide task completion
- bypass Security Policy
- expose raw credentials

---

# 51. Provider Adapter Isolation

Provider-specific behavior remains inside provider adapters.

For example:

```text
Provider A API semantics
```

must not leak into:

```text
Task Engine
Orchestrator
Agent Engine
Runtime Engine
```

---

# 52. Connection Adapter Boundary

Authentication-specific integration belongs to Auth & Connections.

Provider adapters may request:

```text
connection validation
scoped access
endpoint metadata
```

without owning credential storage.

---

# 53. Model Catalog

A model catalog may be maintained per provider.

Example:

```yaml
provider:
  id: provider-a

models:
  - id: model-a
    context_window:
    capabilities:

  - id: model-b
    context_window:
    capabilities:
```

Catalog data may be refreshed.

---

# 54. Model Availability

Model states:

```text
AVAILABLE
UNAVAILABLE
DEPRECATED
UNKNOWN
```

A model being listed does not necessarily mean it is currently callable.

---

# 55. Deprecated Models

A deprecated model should not necessarily disappear immediately.

The Router may:

```text
warn
avoid new selections
allow explicit selection
require migration
```

Policy determines behavior.

---

# 56. Model Versioning

Where providers expose model versions/revisions, Forge may record:

```text
model family
provider model ID
revision
```

Exact semantic versioning should not be assumed when providers do not provide it.

---

# 57. Context Window

Context capacity may be represented as:

```text
known maximum
configured maximum
unknown
```

The Router should reject candidates that clearly cannot satisfy hard context requirements.

---

# 58. Context Requirement

Example:

```yaml
context_requirement:
  minimum_tokens: 100000
```

Candidate model:

```text
context_window: 32000
```

Result:

```text
REJECTED
CAPABILITY_MISMATCH
```

---

# 59. Structured Output

If a Task requires structured output:

```text
structured_output = required
```

the Router must ensure the selected model/provider/runtime path supports it where that requirement applies.

---

# 60. Tool Calling

If the execution requires model tool calling:

```text
tool_calling = required
```

the Router must ensure the selected inference path supports the required mechanism.

Tool authorization remains outside the Router.

---

# 61. Streaming

If execution requires streaming:

```text
streaming = required
```

the selected path must support it.

Streaming capability may depend on:

```text
model
provider
runtime
adapter
```

not solely the model.

---

# 62. Multimodal Requirements

Future tasks may require:

```text
vision
audio
image generation
multimodal input
```

Provider Router can represent these requirements without assuming all providers support them.

---

# 63. Provider Locality

Some projects may require:

```text
local inference only
```

The Router must filter out cloud providers.

Example:

```text
Policy:
LOCAL_ONLY

Cloud Provider:
REJECTED

Local Provider:
ELIGIBLE
```

---

# 64. Data Residency

Future policy may specify:

```text
region
jurisdiction
data residency
```

Provider Router can expose routing constraints for these policies.

Actual enforcement may require runtime/network controls outside the Router.

---

# 65. Privacy Profile

A provider may expose metadata such as:

```text
local
self-hosted
external cloud
retention policy unknown
```

Unknown privacy properties must remain unknown.

The Router must not invent provider privacy guarantees.

---

# 66. Provider Security

Provider security metadata may include:

```text
transport
authentication mechanism
endpoint type
local/remote
credential scope
```

Security Policy Authority remains responsible for deciding whether a provider is permitted.

---

# 67. Provider Trust

Provider trust should not be conflated with Runtime Trust Class.

For example:

```text
Runtime:
L1 External

Provider:
Approved Cloud Provider
```

Both dimensions may matter, but they represent different boundaries.

---

# 68. Routing Decision Explanation

Every important routing decision should be explainable.

Example:

```text
Selected:
Provider A / Model X

Why:
✓ Required tool calling
✓ Required context window
✓ Project-approved
✓ Connection valid
✓ Runtime compatible

Rejected:
Provider B
✗ Context too small

Rejected:
Provider C
✗ Project policy denied
```

This improves debugging and human trust.

---

# 69. Routing Decision Provenance

The decision should retain where relevant:

```text
routing policy version
candidate list
candidate rejection reasons
selected provider
selected model
connection reference
health observation
timestamp
```

---

# 70. Routing Determinism

Given the same:

```text
request
policy
candidate set
provider state
```

the Router should produce the same decision when no dynamic scoring input changes.

Dynamic values such as:

```text
health
latency
rate limits
availability
```

may legitimately change routing.

---

# 71. Routing Expiration

A routing decision may have an expiration.

Example:

```yaml
expires_at:
```

This prevents stale provider decisions from being treated as permanent.

Before execution, relevant state may need revalidation.

---

# 72. Revalidation

A previously resolved provider may become unavailable.

Example:

```text
Resolved:
Provider A

Later:
Provider A unavailable
```

Runtime execution should fail safely or trigger authorized fallback behavior.

Provider Router does not silently bypass policy.

---

# 73. Routing Cache

Provider/model resolution may be cached where safe.

Cache keys should include relevant routing inputs.

Cache invalidation should occur when:

```text
provider changes
model changes
connection changes
policy changes
health changes materially
```

---

# 74. Provider Health Refresh

Health may be refreshed:

```text
on demand
before execution
periodically
after failure
```

The exact strategy is implementation-specific.

---

# 75. Provider Failure

Provider failures may include:

```text
AUTHENTICATION_FAILURE
RATE_LIMIT
UNAVAILABLE
TIMEOUT
MODEL_NOT_FOUND
CAPABILITY_MISMATCH
POLICY_DENIED
CONNECTION_FAILURE
PROVIDER_ERROR
UNKNOWN
```

The Router normalizes provider-level facts.

Task-level recovery belongs to Orchestrator/Task Engine.

---

# 76. Provider Fallback and Task Recovery

Provider fallback:

```text
Provider Router responsibility
```

Task retry/replan:

```text
Orchestrator / Task Engine responsibility
```

These must not be conflated.

---

# 77. Provider Router and Runtime Engine

Canonical relationship:

```text
Task / Agent Requirement
       ↓
Provider Router
       ↓
Provider + Model
       ↓
Runtime Engine
       ↓
Runtime Adapter
       ↓
Execution
```

Where provider selection is controlled by the runtime itself, Forge must represent that limitation.

---

# 78. Provider Router and Capability Resolver

Provider Router proposes/resolves a technically suitable provider/model.

Capability Resolver determines whether the complete execution path is authorized.

```text
Provider Router
       ↓
Provider/Model Candidate
       ↓
Capability Resolver
       ↓
Authorization
```

---

# 79. Provider Router and Security Policy

Security Policy may impose:

```text
allowed providers
blocked providers
local-only
approved connection
maximum cost
data residency
```

Provider Router must respect those constraints.

It cannot override them.

---

# 80. Provider Router and Approval

Some routing decisions may require approval.

Example:

```text
Preferred local provider unavailable
 ↓
Cloud provider fallback
 ↓
Project policy requires approval
 ↓
APPROVAL REQUIRED
```

Provider Router returns the routing condition.

Approval Manager handles approval.

---

# 81. No Unauthorized Fallback

If all approved providers fail:

```text
NO_ELIGIBLE_PROVIDER
```

Forge must not silently use an unapproved provider.

---

# 82. Provider Routing Events

Potential events:

```text
provider.routing.requested
provider.routing.candidates_evaluated
provider.routing.selected
provider.routing.rejected
provider.routing.fallback
provider.routing.failed
provider.health_changed
provider.model_changed
```

Events are observations/signals.

Authoritative provider configuration remains in the provider registry/configuration system.

---

# 83. Observability

Dashboard should expose:

```text
Provider
Model
Connection status
Health
Availability
Routing decision
Routing rationale
Fallbacks
Estimated cost
Observed latency
Policy restrictions
```

Sensitive credential details must never be displayed.

---

# 84. CLI Integration

Conceptual commands:

```text
forge provider list
forge provider inspect <provider>
forge provider health <provider>
forge provider models <provider>
forge provider route --task <task>
forge provider test <provider>
```

Complete CLI semantics belong to `15-CLI-SPECIFICATION.md`.

---

# 85. Security Requirements

Provider Router must:

- avoid raw credential access where possible
- respect Security Policy
- respect project/provider allowlists
- prevent unauthorized provider fallback
- avoid exposing connection secrets
- record important routing decisions
- validate provider/model compatibility
- avoid treating availability as authorization

---

# 86. Secret Safety

Provider Router should operate on:

```text
connection_id
credential reference
scoped credential handle
```

rather than raw secret values wherever possible.

If a lower-level adapter requires a secret, Auth & Connections should provide it through the established secure mechanism.

---

# 87. Provider Routing and Prompt Injection

Provider Router must not allow model-generated text to silently modify provider policy.

For example:

```text
Agent output:
"Use an unapproved provider."
```

must not override:

```text
Project Policy
Security Policy
Routing Policy
```

Provider routing decisions remain system-controlled.

---

# 88. Model-Generated Routing Suggestions

An Agent or model may suggest:

```text
Use Model X
```

but this is a proposal.

The Router must validate it against:

```text
requirements
policy
availability
capability
connection
security
```

---

# 89. Provider Router Failure Modes

The Router should explicitly handle:

```text
no provider configured
no connection
no compatible model
all providers unavailable
policy blocks all candidates
runtime cannot consume selected provider
health unknown
provider metadata stale
```

Each should produce actionable diagnostics.

---

# 90. No Provider Available

Example:

```text
Task requires:
tool calling
long context

Available:
Provider A:
context too small

Provider B:
tool calling unsupported
```

Result:

```text
NO_ELIGIBLE_PROVIDER
```

The system should explain why.

---

# 91. All Providers Unavailable

Result:

```text
PROVIDER_UNAVAILABLE
```

The Task Engine/Orchestrator may decide:

```text
retry later
pause
fallback runtime
replan
human escalation
```

---

# 92. Connection Missing

Result:

```text
CONNECTION_REQUIRED
```

The Auth & Connections subsystem may guide the user through configuration.

Provider Router does not itself invent authentication flows.

---

# 93. Provider Disabled

A provider may be:

```text
configured
healthy
enabled = false
```

It must not be selected.

---

# 94. Provider Policy Denied

Example:

```text
Provider:
Cloud Provider

Project:
LOCAL_ONLY
```

Result:

```text
POLICY_DENIED
```

This must not be bypassed by fallback.

---

# 95. Model Policy Denied

A project may prohibit certain model families.

The Router must filter them before selection.

---

# 96. Provider Cost Policy

A project may define:

```yaml
cost_policy:
  max_estimated_cost:
  preferred_cost_class:
```

The Router may use estimates where available.

Unknown costs should not be treated as zero.

---

# 97. Provider Rate Limit Policy

The Router may avoid a provider currently known to be rate-limited.

It must distinguish:

```text
known rate-limited
```

from:

```text
unknown
```

---

# 98. Provider Reliability

Historical success may inform routing preferences.

Example:

```text
Provider A:
high observed reliability

Provider B:
degraded
```

Historical reliability is a preference signal, not a guarantee.

---

# 99. Provider Selection Example

Task:

```text
Build authentication system
```

Requirements:

```text
code generation
tool calling
structured output
long context
```

Candidates:

```text
Provider A / Model X
✓ all capabilities
✓ approved
✓ connection valid

Provider B / Model Y
✓ capabilities
✗ policy denied

Provider C / Model Z
✗ context too small
```

Selection:

```text
Provider A / Model X
```

---

# 100. Provider Fallback Example

```text
Primary:
Provider A / Model X

Failure:
rate limited

Fallback:
Provider B / Model X

Validation:
✓ capabilities
✓ connection
✓ project policy

Result:
Provider B / Model X
```

If Provider B requires approval:

```text
APPROVAL REQUIRED
```

instead of silent fallback.

---

# 101. Local Fallback Example

Policy:

```text
local preferred
cloud allowed as fallback
```

Flow:

```text
Local Model
 ↓
Unavailable
 ↓
Cloud Model
 ↓
Policy Check
 ↓
Approval if required
 ↓
Execute
```

---

# 102. Runtime-Embedded Provider Example

```text
Forge
 ↓
External Runtime
 ↓
Runtime internally selects provider
```

Forge records:

```text
provider_control:
PARTIAL / UNKNOWN
```

It does not falsely report:

```text
provider_selected_by_forge = true
```

---

# 103. Provider Router MVP

V0.1 must prove:

```text
provider registration
model registration
connection reference
basic health
capability filtering
provider/model selection
policy filtering
basic fallback
routing explanation
runtime compatibility
CLI visibility
dashboard visibility
```

---

# 104. V0.1 Scope Recommendation

The MVP should keep provider support deliberately small.

For example:

```text
one approved cloud provider
+
one local/self-hosted provider
```

The architecture must remain capable of supporting more.

This is a scope recommendation, not a permanent provider limitation.

---

# 105. Provider Router Test Strategy

## Unit Tests

Test:

- candidate filtering
- capability matching
- policy filtering
- scoring
- fallback
- model requirements
- provider requirements

## Integration Tests

Test:

- real provider connection
- model availability
- runtime compatibility
- routing resolution
- failure handling

## Security Tests

Test:

- denied provider
- expired connection
- unauthorized fallback
- secret leakage
- model policy bypass
- prompt-generated routing manipulation

---

# 106. Routing Simulation

Provider Router should support simulation.

Example:

```text
forge provider route --simulate
```

Output:

```text
Selected:
Provider A / Model X

Rejected:
Provider B
Reason: policy denied

Rejected:
Provider C
Reason: context insufficient
```

No real inference is required.

---

# 107. Routing Audit

Important routing decisions should be auditable:

```text
who requested
what was requested
candidate set
policy context
selected provider/model
rejection reasons
fallback
timestamp
```

Credential contents must never be included.

---

# 108. Routing Decision Record

Conceptual structure:

```yaml
routing_decision:
  id:
  request_id:
  project_id:
  task_id:
  agent_id:

  selected:
    provider_id:
    model_id:
    connection_id:

  candidates:
    - provider_id:
      model_id:
      result:
      reason:

  policy:
    version:

  created_at:
  expires_at:
```

---

# 109. Routing Idempotency

Repeated identical routing requests should not create contradictory decisions when the relevant state has not changed.

Dynamic provider state may legitimately produce a different result.

---

# 110. Routing Concurrency

Concurrent routing requests must safely interact with:

```text
provider registry
connection state
rate-limit state
health state
policy
```

The Router should avoid stale shared state where it could cause unsafe selection.

---

# 111. Provider State Changes

A provider may change state while a route is being resolved.

Example:

```text
Health:
AVAILABLE

During resolution:
provider becomes UNAVAILABLE
```

Execution-time validation should detect relevant state changes.

---

# 112. Provider Router and Runtime Discovery

Runtime Discovery discovers runtime availability.

Provider Router does not use runtime discovery as a substitute for provider discovery.

Relationship:

```text
Runtime Discovery
→ runtime facts

Provider Registry
→ provider/model facts

Provider Router
→ provider/model selection
```

---

# 113. Provider Router and Auth

Relationship:

```text
Provider Router
      ↓
Connection reference
      ↓
Auth & Connections
      ↓
Connection validation
```

Raw credentials should remain behind the auth boundary.

---

# 114. Provider Router and Memory

Routing history may become useful for future optimization.

Examples:

```text
previous provider success
latency history
failure history
cost history
```

Memory/learning systems may consume this data.

V0.1 should not require adaptive routing based on long-term learning.

---

# 115. Provider Router and Events

Routing events belong to the broader Event System.

Provider Router publishes domain events.

It does not own global event persistence architecture.

---

# 116. Provider Router and Database

Provider/model metadata may be persisted.

The Database specification determines storage implementation.

V0.1 remains compatible with SQLite WAL.

---

# 117. Provider Router Architectural Invariants

### Invariant 001 — Provider Separation

Provider and Model remain distinct.

### Invariant 002 — Runtime Separation

Provider Router does not own Runtime execution.

### Invariant 003 — Authorization Separation

Provider selection does not equal execution authorization.

### Invariant 004 — Policy Supremacy

Provider Router cannot override Security or Project Policy.

### Invariant 005 — Credential Separation

Provider Router does not become the credential store.

### Invariant 006 — Capability Matching

Hard model/provider requirements must be satisfied before selection.

### Invariant 007 — No Silent Downgrade

Fallback cannot silently violate hard requirements.

### Invariant 008 — Honest Runtime Control

Forge cannot claim provider control inside opaque runtimes when such control is unavailable.

### Invariant 009 — Explainability

Important routing decisions must be explainable.

### Invariant 010 — Secret Safety

Routing records must never contain raw credentials.

### Invariant 011 — Adapter Isolation

Provider-specific integration remains isolated in adapters.

### Invariant 012 — Availability Is Not Authorization

Healthy/available providers are not automatically authorized.

### Invariant 013 — Dynamic State Awareness

Routing decisions may become stale as provider state changes.

### Invariant 014 — Runtime Compatibility

Selected provider/model must be compatible with the selected runtime path.

### Invariant 015 — Extensibility

New providers should be addable without rewriting core orchestration/task architecture.

---

# 118. Dependency Map

```text
09 Provider Router
│
├── depends on
│   ├── 00 Product Thesis
│   ├── 01 Master PRD
│   ├── 02 System Architecture
│   ├── 06.5 Architectural Decisions
│   ├── 07 Runtime Engine
│   └── 08 Runtime Discovery
│
├── integrates with
│   ├── Auth & Connections
│   ├── Capability Resolver
│   ├── Security Policy
│   ├── Runtime Registry
│   └── Event System
│
└── consumed by
    ├── Agent Engine
    ├── Orchestrator
    ├── Runtime Engine
    ├── CLI
    └── Dashboard
```

---

# 119. Implementation Boundary

Provider Router contains:

```text
provider registry integration
model registry integration
candidate generation
candidate filtering
routing policy
selection
fallback evaluation
health-aware routing
routing explanation
routing records
```

It does not contain:

```text
credential storage
task state
runtime process lifecycle
agent lifecycle
tool execution
verification
security policy ownership
```

---

# 120. Recommended V0.1 Module Structure

Conceptually:

```text
src/
└── provider-router/
    ├── provider-registry
    ├── model-registry
    ├── provider-adapters
    ├── candidate-builder
    ├── candidate-filter
    ├── routing-policy
    ├── routing-engine
    ├── fallback-engine
    ├── health-manager
    ├── routing-explainer
    └── routing-audit
```

These are logical modules, not mandatory files.

---

# 121. Final Provider Model

```text
Task / Agent Requirement
          ↓
   Provider Router
          ↓
Candidate Providers
          ↓
Hard Constraint Filtering
          ↓
Policy Filtering
          ↓
Capability Filtering
          ↓
Preference / Scoring
          ↓
Provider + Model Selection
          ↓
Capability Resolver
          ↓
Execution Authorization
          ↓
Runtime Engine
```

---

# 122. Final Principle

> **Provider supplies inference access.**
>
> **Model provides intelligence.**
>
> **Runtime provides execution.**
>
> **Provider Router selects the appropriate inference path.**
>
> **Capability Resolver determines what the complete execution is allowed to do.**
>
> **Runtime Engine performs the execution.**

Forge Wanzz should therefore be able to change:

```text
Provider
```

without changing:

```text
Agent
Task
Orchestrator
Skill
Runtime
Verification
```

and should be able to change:

```text
Model
```

without changing:

```text
Task architecture
Agent architecture
Runtime architecture
```

The Provider Router exists to make model access a replaceable routing concern rather than a hardcoded dependency embedded throughout Forge.
