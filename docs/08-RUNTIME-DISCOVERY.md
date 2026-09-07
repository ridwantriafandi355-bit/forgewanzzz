# 08 — RUNTIME DISCOVERY

**Forge Wanzz — AI Software Factory**  
**Version:** 0.1  
**Status:** Canonical Detailed Specification  
**Depends On:** 00 Product Thesis, 01 Master PRD, 02 System Architecture, 06.5 Architectural Decisions, 07 Runtime Engine

---

# 1. Purpose

Runtime Discovery is the subsystem responsible for discovering execution runtimes available in the environment where Forge Wanzz is running.

The purpose is to answer:

> **"What runtimes are actually available to Forge right now, where are they, what version are they, what can Forge observe/control, and what capabilities can safely be asserted?"**

Runtime Discovery turns environmental facts into structured runtime discovery results.

Conceptually:

```text
HOST ENVIRONMENT
      ↓
RUNTIME DISCOVERY
      ↓
DETECTION
      ↓
VALIDATION
      ↓
CAPABILITY / TRUST / CONTROL PROFILING
      ↓
RUNTIME REGISTRATION
      ↓
RUNTIME ENGINE
```

Runtime Discovery does not execute project tasks.

It discovers execution capabilities.

---

# 2. Core Definition

A **Runtime Discovery** operation inspects the current environment for supported runtime implementations.

Examples include:

```text
Claude Code
OpenCode
Antigravity CLI
Codex
Cline
Kilo
Native Forge Runtime
Custom Runtime
```

The actual supported runtime list is extensible.

Discovery must be adapter-driven rather than hardcoded into the core system.

---

# 3. Discovery Responsibilities

Runtime Discovery owns:

1. Runtime detection.
2. Executable discovery.
3. Installation detection.
4. Version detection.
5. Runtime identity detection.
6. Platform compatibility detection.
7. Basic health probing where appropriate.
8. Authentication-state detection where safely supported.
9. Runtime capability detection.
10. Trust/control/observability profile discovery.
11. Discovery result normalization.
12. Discovery diagnostics.
13. Discovery provenance.
14. Runtime registry synchronization.

---

# 4. Discovery Non-Responsibilities

Runtime Discovery does not own:

| Responsibility | Owner |
|---|---|
| Runtime execution | Runtime Engine |
| Runtime scheduling | Orchestrator |
| Task state | Task Engine |
| Agent lifecycle | Agent Engine |
| Organization formation | Organization Manager |
| Model/provider routing | Provider Router |
| Credential storage | Auth & Connections |
| Security policy | Security Policy Authority |
| Capability authorization | Capability Resolver |
| Verification | Verification Engine |
| Tool execution | Tool Execution Engine |
| Human approval | Approval Manager / Human Operator |

Discovery provides facts to these systems.

It does not grant authority.

---

# 5. Fundamental Distinctions

Runtime Discovery must preserve the following distinctions:

```text
Detected
Installed
Authenticated
Available
Healthy
Authorized
Selected
Running
```

These are different states.

For example:

```text
Installed = true
Detected = true
Authenticated = false
Available = false
Authorized = false
```

A runtime being installed does not mean it is usable.

A runtime being usable does not mean it is authorized for a specific task.

---

# 6. Discovery vs Runtime Engine

Runtime Discovery answers:

```text
"What exists?"
```

Runtime Engine answers:

```text
"How do we execute it?"
```

Relationship:

```text
Runtime Discovery
       ↓
Runtime Registry
       ↓
Runtime Engine
```

Runtime Engine must not duplicate discovery logic.

Runtime Discovery must not contain execution lifecycle logic.

---

# 7. Discovery Architecture

Conceptual architecture:

```text
Runtime Discovery
│
├── Discovery Coordinator
├── Runtime Detectors
├── Executable Resolver
├── Version Resolver
├── Authentication Probe
├── Capability Detector
├── Trust Profiler
├── Control Profiler
├── Observability Profiler
├── Platform Compatibility Detector
├── Health Probe
├── Result Normalizer
└── Discovery Reporter
```

For V0.1 these may exist as modules inside the local-first modular monolith.

They do not need to be independent services.

---

# 8. Discovery Coordinator

The Discovery Coordinator manages a discovery operation.

Responsibilities:

- determine which detectors to execute
- execute detectors
- isolate detector failures
- aggregate results
- normalize results
- report discovery status

One detector failing must not necessarily prevent other runtimes from being discovered.

---

# 9. Runtime Detector

A Runtime Detector knows how to identify a specific runtime.

Conceptual interface:

```ts
interface RuntimeDetector {
  id: string

  detect(): Promise<RuntimeDetectionResult>

  getVersion?(): Promise<VersionResult>

  getAuthenticationStatus?(): Promise<AuthDetectionResult>

  getCapabilities?(): Promise<RuntimeCapabilities>

  getProfiles?(): Promise<RuntimeProfiles>

  healthCheck?(): Promise<HealthResult>
}
```

Optional operations must be explicitly represented.

Forge must not assume every runtime supports every detection method.

---

# 10. Detector Isolation

A detector must be isolated from other detectors.

A broken detector for one runtime should produce:

```text
Detector Failure
```

rather than:

```text
Global Discovery Failure
```

unless the failure affects the entire discovery environment.

---

# 11. Detection Sources

Runtime Discovery may use:

```text
PATH lookup
known installation locations
environment metadata
version commands
runtime-specific metadata
configuration files
package managers
platform-specific locations
explicit user configuration
```

Discovery should prefer safe, deterministic detection mechanisms.

---

# 12. PATH Detection

A common detection mechanism is executable lookup.

Conceptually:

```text
PATH
 ↓
Executable Name
 ↓
Executable Found
 ↓
Executable Path
```

Example:

```text
agy
claude
opencode
codex
```

Executable names are runtime-specific detector knowledge.

---

# 13. Explicit Configuration

Users may explicitly configure a runtime:

```yaml
runtime:
  id: custom-runtime
  executable: /path/to/runtime
```

Explicit configuration may be used when automatic detection cannot discover a runtime.

The configured runtime must still undergo validation.

Configuration must not blindly imply:

```text
healthy
authenticated
authorized
```

---

# 14. Installation Detection

Discovery should determine whether a runtime appears to be installed.

Possible states:

```text
INSTALLED
NOT_INSTALLED
UNKNOWN
```

A runtime can be configured but still fail installation validation.

---

# 15. Executable Resolution

When an executable is found, Discovery should record:

```text
executable name
resolved path
resolution source
platform
architecture where available
```

Example:

```yaml
executable:
  name: agy
  path: /usr/local/bin/agy
  source: PATH
```

The resolved path should be treated as an observed fact.

---

# 16. Executable Validation

Finding a file named like a runtime is insufficient.

Where practical, Discovery should validate:

```text
exists
executable
invocable
expected runtime identity
version query
```

A failed validation should not be converted into a successful detection.

---

# 17. Version Detection

Version detection should use the safest runtime-supported mechanism.

Possible mechanisms:

```text
--version
version subcommand
runtime metadata
package metadata
```

The result should distinguish:

```text
VERSION_DETECTED
VERSION_UNKNOWN
VERSION_CHECK_FAILED
```

---

# 18. Version Provenance

Every detected version should have provenance where possible.

Example:

```yaml
version:
  value: "1.2.3"
  source: "--version"
  detected_at:
  confidence: observed
```

Forge should distinguish:

```text
Observed
Configured
Inferred
Unknown
```

---

# 19. Authentication Detection

Authentication detection is intentionally conservative.

Discovery may determine:

```text
AUTHENTICATED
AUTH_REQUIRED
AUTH_UNKNOWN
AUTH_CHECK_FAILED
```

Only when the runtime exposes a safe mechanism for determining authentication state.

---

# 20. Authentication Safety

Runtime Discovery must not:

- extract tokens
- dump credentials
- display secrets
- bypass login flows
- scrape private credentials
- copy OAuth tokens unnecessarily
- expose environment secrets

Authentication detection must inspect state without exposing credential material.

---

# 21. Authentication Boundary

Credential storage and connection management belong to:

`10-AUTH-CONNECTIONS.md`

Runtime Discovery may report:

```text
authentication appears available
```

but should not become a credential manager.

---

# 22. Provider Detection

Where a runtime exposes provider information safely, Discovery may record:

```text
provider
model
provider mode
```

However:

```text
Runtime
≠
Provider
```

Provider routing remains owned by Provider Router.

Discovery should not make provider selection decisions.

---

# 23. Model Detection

Where safely observable, Discovery may report:

```text
default model
supported model modes
model selection support
```

This is informational.

Model routing remains outside Runtime Discovery.

---

# 24. Capability Detection

Discovery determines what the runtime can technically support.

Examples:

```text
filesystem_access
shell_access
network_access
git_access
streaming
interactive
non_interactive
structured_output
cancellation
timeout
mcp_support
model_selection
tool_calling
```

These are technical capabilities.

They are not permissions.

---

# 25. Capability Evidence

Capability declarations should have evidence.

Conceptually:

```yaml
capability:
  id: streaming
  supported: true
  source: adapter_probe
  confidence: observed
```

A capability may also be:

```text
declared
configured
observed
inferred
unknown
```

The system should avoid presenting weak inference as confirmed capability.

---

# 26. Capability vs Permission

Example:

```text
Runtime Capability:
filesystem_write = technically supported

Permission:
filesystem_write = DENIED
```

Capability describes possibility.

Permission describes authorization.

Discovery never grants permission.

---

# 27. Trust Class Discovery

Runtime Discovery may determine an initial Trust Class.

Canonical classes:

```text
L0 — Unknown
L1 — Trusted External
L2 — Governed External
L3 — Sandboxed
L4 — Native Forge Controlled
```

Trust Class is not equivalent to:

```text
Security Level
Permission
Capability
Authorization
```

---

# 28. Trust Class Evidence

Trust classification should be based on observable execution properties.

Examples:

```text
native Forge worker
external CLI
container sandbox
MCP-mediated runtime
uncontrolled host process
```

The classification should not exaggerate governance.

---

# 29. Control Profile

Discovery may produce:

```yaml
control_profile:
  process_start: true
  process_cancel: true
  stdin: true
  workspace_boundary: true
  internal_tools: false
  internal_network: false
  internal_filesystem: false
```

The exact profile depends on runtime integration.

---

# 30. Observability Profile

Discovery may produce:

```yaml
observability_profile:
  stdout: true
  stderr: true
  exit_status: true
  process_state: true
  structured_output: true
  internal_tool_calls: false
  internal_network_calls: false
  internal_filesystem_actions: false
```

Unknown properties must remain unknown.

---

# 31. Security Profile

Discovery may collect technical security properties such as:

```text
process isolation
sandboxing
filesystem restrictions
network restrictions
host access
credential boundary
```

Discovery does not define project security policy.

---

# 32. Platform Compatibility

Runtime Discovery should identify compatibility with:

```text
operating system
CPU architecture
shell environment
filesystem
required dependencies
```

Possible status:

```text
COMPATIBLE
INCOMPATIBLE
PARTIALLY_COMPATIBLE
UNKNOWN
```

---

# 33. Health Probe

Where safe, Discovery may run a lightweight health check.

Health states:

```text
AVAILABLE
DEGRADED
UNAVAILABLE
AUTH_REQUIRED
MISCONFIGURED
UNKNOWN
```

Health probing must avoid performing project work.

---

# 34. Health vs Availability

A runtime can be:

```text
installed
but unavailable
```

or:

```text
available
but degraded
```

or:

```text
healthy
but unauthorized
```

Discovery must preserve these distinctions.

---

# 35. Discovery Result

Canonical discovery result:

```yaml
runtime:
  id:
  name:
  installed:
  executable:
  version:
  authentication:
  platform:
  compatibility:
  capabilities:
  trust_class:
  security_profile:
  control_profile:
  observability_profile:
  health:
  evidence:
  discovered_at:
  detector:
```

Fields may be unknown.

Unknown must not be silently converted to false.

---

# 36. Discovery Confidence

Discovery results may include confidence:

```text
OBSERVED
DECLARED
CONFIGURED
INFERRED
UNKNOWN
```

Example:

```yaml
authentication:
  status: AUTHENTICATED
  confidence: OBSERVED
```

---

# 37. Discovery Provenance

Each important fact should ideally have provenance:

```text
detector
method
timestamp
source
confidence
```

This allows the dashboard and diagnostics to explain:

> "Why does Forge think this runtime is available?"

---

# 38. Discovery Diagnostics

A detector should provide safe diagnostics when detection fails.

Example:

```yaml
diagnostic:
  code: VERSION_CHECK_FAILED
  message: Runtime executable was found but version command failed.
  severity: warning
```

Diagnostics must not expose credentials or unnecessary environment information.

---

# 39. Partial Discovery

Discovery should support partial results.

Example:

```text
Installed: YES
Executable: YES
Version: UNKNOWN
Authentication: UNKNOWN
Capabilities: PARTIAL
Health: UNKNOWN
```

Partial knowledge is preferable to fabricated certainty.

---

# 40. Discovery Failure

Possible failure classes:

```text
DETECTOR_FAILURE
EXECUTABLE_LOOKUP_FAILURE
VERSION_CHECK_FAILURE
AUTH_CHECK_FAILURE
CAPABILITY_PROBE_FAILURE
HEALTH_CHECK_FAILURE
PLATFORM_CHECK_FAILURE
PERMISSION_ERROR
TIMEOUT
UNKNOWN
```

A runtime-specific failure should normally remain isolated to that runtime.

---

# 41. Discovery Timeout

Individual probes should have bounded execution time.

A runtime detector must not be able to hang the entire discovery operation indefinitely.

Timeout should produce:

```text
probe timed out
```

not:

```text
runtime unavailable
```

unless the evidence supports that conclusion.

---

# 42. Discovery Security

Runtime Discovery runs against the host environment and therefore must be conservative.

It must avoid:

- arbitrary recursive filesystem scanning by default
- reading unrelated secrets
- dumping environment variables
- executing untrusted discovered files
- downloading unknown binaries
- modifying system configuration
- bypassing runtime authentication
- silently installing runtimes

Discovery is observation-first.

---

# 43. No Automatic Installation

Discovery does not automatically install a missing runtime.

If a runtime is not detected:

```text
NOT_INSTALLED
```

may be reported.

Installation is a separate explicit operation and belongs outside the core discovery responsibility.

---

# 44. Detector Execution Policy

Detector commands should be:

- deterministic where possible
- minimal
- bounded
- non-destructive
- read-oriented
- auditable

A detector should not perform project modifications.

---

# 45. Runtime Discovery and PATH

Discovery should support the host PATH.

However, PATH should not be treated as the only source of runtime detection.

Possible sources:

```text
PATH
explicit configuration
known installation locations
package metadata
platform registries
runtime metadata
```

---

# 46. Platform-Specific Discovery

Platform-specific discovery may use platform-native mechanisms.

Examples:

```text
Windows:
PATH
PowerShell
registry where appropriate

macOS:
PATH
standard application/package locations

Linux:
PATH
package metadata
standard binary locations
```

Platform logic belongs inside detectors/adapters, not the core Runtime Engine.

---

# 47. Discovery Caching

Discovery results may be cached to reduce repeated probing.

Cached results must include:

```text
detected_at
detector version
runtime identity
environment context where relevant
```

Stale results must not be treated as current facts indefinitely.

---

# 48. Refresh

Forge should support explicit runtime refresh.

Conceptual CLI:

```text
forge runtime discover
forge runtime refresh
```

A refresh should invalidate relevant cached discovery information.

---

# 49. Startup Discovery

Forge may perform discovery during startup.

Startup discovery should not prevent Forge from starting merely because one runtime detector fails.

Example:

```text
Forge Startup
 ↓
Discover runtimes
 ├── Claude Code ✓
 ├── OpenCode ✓
 ├── Antigravity ✓
 ├── Codex detector failed ⚠
 └── Native Runtime ✓
 ↓
Forge Ready
```

---

# 50. On-Demand Discovery

Discovery may also run on demand.

Examples:

```text
forge runtime discover
forge runtime refresh
```

On-demand discovery is useful after:

- installing a runtime
- upgrading a runtime
- changing PATH
- changing authentication
- changing runtime configuration

---

# 51. Runtime Registry Synchronization

After discovery:

```text
Discovery Result
      ↓
Validation
      ↓
Registry Synchronization
      ↓
Runtime Registry
```

The Runtime Registry becomes the runtime information consumed by Runtime Engine.

---

# 52. Registry State

A registered runtime should distinguish:

```text
discovered
configured
enabled
disabled
available
unavailable
```

Discovery updates observed facts.

Administrative enable/disable policy remains separate.

---

# 53. Runtime Enablement

A discovered runtime may be:

```text
Detected: YES
Enabled: NO
```

This allows an administrator/user to prevent a runtime from being selected without uninstalling it.

Discovery must not automatically enable a runtime merely because it is found.

---

# 54. Runtime Selection Eligibility

A runtime may be eligible only when:

```text
detected
+
compatible
+
available
+
enabled
+
required capabilities satisfied
+
trust requirement satisfied
+
policy allows
```

Capability authorization still occurs for the specific execution.

---

# 55. Discovery Does Not Authorize

This is a core invariant.

```text
Detected
≠
Authorized
```

```text
Available
≠
Authorized
```

```text
Healthy
≠
Authorized
```

Authorization remains the responsibility of Capability Resolver and Security Policy.

---

# 56. Discovery Does Not Select

Discovery may rank or expose candidate information, but final runtime selection belongs to Runtime Strategy / Runtime Engine according to the established architecture.

Discovery should not decide:

> "This runtime must execute Task X."

---

# 57. Multiple Versions

Multiple installations of the same runtime may exist.

Example:

```text
Runtime:
Claude Code

Installation A:
version 1.x
path A

Installation B:
version 2.x
path B
```

Discovery should be capable of representing multiple runtime instances where the environment permits it.

---

# 58. Runtime Instance Identity

A runtime instance may be identified by a combination of:

```text
runtime family
executable path
installation identity
version
environment
```

The exact identity algorithm is implementation-specific.

---

# 59. Duplicate Detection

Discovery should identify likely duplicate installations.

It should not arbitrarily delete or merge them.

Instead:

```text
Runtime Instance A
Runtime Instance B
```

remain separate candidates until registry policy resolves them.

---

# 60. Runtime Family

A runtime family groups compatible runtime instances.

Example:

```text
Family:
claude-code

Instances:
claude-code@path-A
claude-code@path-B
```

This is useful for selection and version management.

---

# 61. Detector Metadata

Each detector should declare:

```yaml
detector:
  id:
  runtime_family:
  supported_platforms:
  methods:
  version:
```

This allows Forge to understand which detector produced a result.

---

# 62. Detector Versioning

Detector behavior may change over time.

Discovery results should therefore retain detector identity/version where practical.

This helps diagnose:

```text
Why did Forge detect this runtime differently after an upgrade?
```

---

# 63. Runtime Metadata Normalization

Different runtimes may report different concepts.

Discovery normalizes them into generic Forge concepts:

```text
runtime identity
version
availability
authentication
capabilities
trust
control
observability
security
health
```

Runtime-specific metadata may remain attached as adapter-specific metadata.

---

# 64. Unknown Values

Unknown is a valid state.

Use:

```text
UNKNOWN
```

instead of guessing.

Examples:

```text
authentication: UNKNOWN
internal_tool_calls: UNKNOWN
network_access: UNKNOWN
```

This is especially important for external CLIs.

---

# 65. External CLI Discovery

External coding CLIs should be discovered through their supported mechanisms.

Discovery may determine:

```text
installed
path
version
basic health
safe authentication state
declared capabilities
control profile
observability profile
trust class
```

It must not claim internal governance that cannot be verified.

---

# 66. Opaque Runtime

An opaque runtime is one whose internal execution behavior Forge cannot fully inspect.

Example:

```text
Forge
 ↓
External CLI
 ↓
Internal shell/filesystem/network/tool behavior
```

Discovery should represent the runtime's observability/control limitations.

---

# 67. Native Runtime Discovery

Forge's own native runtime may be detected as:

```text
L4
```

because Forge controls its execution boundary directly.

The exact security properties still depend on the implementation.

L4 does not mean "automatically secure."

---

# 68. Sandboxed Runtime Discovery

A sandboxed runtime may be classified as L3 when Forge can establish the relevant sandbox boundary.

Discovery should record the actual sandbox mechanism where useful.

---

# 69. Governed External Runtime

An external runtime may qualify as L2 when the adapter can establish meaningful mediation/control beyond basic process invocation.

Examples may include:

```text
tool mediation
IPC
PTY control
path restrictions
runtime-specific governance hooks
```

The adapter must declare actual guarantees.

---

# 70. Unknown Runtime

A runtime with insufficient evidence should remain:

```text
L0 — Unknown
```

rather than being upgraded based on assumptions.

---

# 71. Runtime Discovery API

Conceptual service:

```ts
interface RuntimeDiscoveryService {
  discover(): Promise<RuntimeDiscoveryReport>

  discoverRuntime(
    runtimeFamily: string
  ): Promise<RuntimeDetectionResult>

  refresh(): Promise<RuntimeDiscoveryReport>

  getLastReport(): Promise<RuntimeDiscoveryReport>
}
```

Exact transport is implementation-specific.

---

# 72. Discovery Report

A discovery report may contain:

```yaml
report:
  id:
  started_at:
  completed_at:
  host:
  platform:
  detector_count:
  successful_detectors:
  failed_detectors:
  runtimes:
  diagnostics:
```

---

# 73. Discovery Events

Potential events:

```text
runtime.discovery.started
runtime.discovery.detector_started
runtime.discovery.detected
runtime.discovery.detector_failed
runtime.discovery.completed
runtime.discovery.refresh_requested
```

Events are informational and auditable.

They do not replace Registry state.

---

# 74. Discovery Observability

The dashboard should allow users to understand:

```text
What was detected?
Where?
Version?
Authentication?
Capabilities?
Trust?
Control?
Observability?
Health?
When was it detected?
Why does Forge believe it exists?
```

---

# 75. Dashboard Example

Conceptually:

```text
AI RUNTIMES

┌─────────────────────────────────────┐
│ Claude Code                         │
│ ✓ Installed                         │
│ vX.X.X                              │
│ Auth: Connected                     │
│ Trust: L1                           │
│ Health: Available                   │
│                                     │
│ Capabilities:                      │
│ ✓ Shell                             │
│ ✓ Filesystem                        │
│ ✓ Git                               │
│ ✓ Streaming                         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Antigravity CLI                     │
│ ✓ Installed                         │
│ Version: detected                   │
│ Auth: Unknown                       │
│ Trust: L1                           │
│ Health: Unknown                     │
└─────────────────────────────────────┘
```

The UI must not imply authorization merely from detection.

---

# 76. CLI Example

```text
$ forge runtime discover

Forge Runtime Discovery

✓ Native Forge Runtime
  Version: 0.1
  Trust: L4
  Health: Available

✓ Claude Code
  Version: detected
  Trust: L1
  Health: Available

✓ Antigravity
  Version: detected
  Trust: L1
  Health: Unknown

○ Codex
  Not detected

Discovery complete.
```

---

# 77. Discovery Refresh Example

```text
$ forge runtime refresh

Scanning runtime environment...

✓ Native Runtime
✓ Claude Code
✓ Antigravity
✓ OpenCode

Registry updated.
```

---

# 78. Discovery After Installation

Example:

```text
Before installation:

Codex
Not Detected

User installs runtime.

After:

forge runtime refresh

Codex
Detected
Version: ...
```

Discovery should be repeatable.

---

# 79. Discovery After Authentication

Example:

```text
Before:

Runtime:
Authenticated = UNKNOWN

After user authenticates:

forge runtime refresh

Authenticated = AUTHENTICATED
```

Discovery observes the state.

It does not perform authentication unless a separate explicit auth flow is invoked.

---

# 80. Runtime Discovery and Security

Discovery must operate with least privilege where practical.

It should avoid:

```text
root/admin escalation
credential extraction
unbounded filesystem traversal
arbitrary code execution
network calls without explicit need
```

Runtime-specific checks should be narrowly scoped.

---

# 81. Network During Discovery

Network access should not be required unless a detector explicitly needs it.

If a runtime provides a local health command, prefer that over external network requests.

Discovery should clearly record network-dependent checks.

---

# 82. No Runtime Execution During Discovery

Discovery must not execute project tasks.

A detector may invoke a safe version/health command if required.

It must not:

```text
modify project files
run arbitrary user code
deploy software
commit code
send project prompts
```

---

# 83. Detector Safety

Each detector should be treated as implementation code with a security boundary.

A detector must not be allowed to:

- silently install software
- modify PATH
- modify project files
- alter credentials
- disable security controls
- execute arbitrary discovered content

---

# 84. Discovery Performance

Discovery should be fast enough for interactive use.

Performance goals are implementation targets, not architectural guarantees.

Possible optimizations:

```text
parallel detector execution
bounded probes
cached results
incremental refresh
lazy capability probing
```

Do not sacrifice correctness for arbitrary latency targets.

---

# 85. Parallel Detection

Independent detectors may execute concurrently.

Example:

```text
Claude Detector ──────┐
OpenCode Detector ────┤
Antigravity Detector ─┼──→ Aggregator
Codex Detector ───────┤
Native Detector ──────┘
```

One detector's failure should not block unrelated detectors.

---

# 86. Detector Resource Limits

Each detector should have bounded:

```text
execution time
output size
process count
filesystem scope
network behavior
```

Exact limits belong to implementation/policy.

---

# 87. Discovery Reproducibility

A discovery report should be reproducible enough to answer:

```text
What environment was inspected?
Which detectors ran?
What methods were used?
What was observed?
When?
```

Perfect deterministic reproducibility is not required because the host environment can change.

---

# 88. Discovery and Environment Changes

Runtime state may change after discovery.

Examples:

```text
runtime upgraded
runtime removed
PATH changed
authentication expired
runtime process unavailable
configuration changed
```

Discovery results should therefore be treated as observations with timestamps, not eternal truths.

---

# 89. Stale Runtime Detection

Runtime Engine or Runtime Resolver should be able to detect when registry information may be stale.

Possible triggers:

```text
execution failure
health failure
manual refresh
environment change
configured refresh interval
```

The response may be:

```text
re-probe
mark degraded
mark unavailable
request refresh
```

---

# 90. Discovery and Runtime Health

Discovery may perform initial health detection.

Runtime Engine remains responsible for runtime health during actual execution.

Thus:

```text
Discovery:
"What did the runtime look like when inspected?"

Runtime Engine:
"How is the runtime behaving during execution?"
```

---

# 91. Discovery and Authentication Lifecycle

Authentication may expire after discovery.

Therefore:

```text
Discovery:
AUTHENTICATED

Later:
AUTH_REQUIRED
```

Runtime execution must still validate current authorization/connection state where required.

Discovery is not a permanent authentication guarantee.

---

# 92. Discovery and Capability Drift

Runtime capabilities may change after upgrade/configuration.

Example:

```text
Version 1:
streaming = true

Version 2:
streaming = false
```

A refresh should be able to update capability metadata.

---

# 93. Discovery and Adapter Compatibility

A runtime can be installed but unsupported by the current Forge adapter.

Example:

```text
Runtime detected:
YES

Adapter:
INCOMPATIBLE
```

This must be represented explicitly.

---

# 94. Adapter Missing

Possible state:

```text
Runtime detected
Adapter unavailable
```

Discovery can report the runtime as detected while Runtime Engine cannot execute it through Forge.

This is preferable to pretending the runtime is unsupported by the host itself.

---

# 95. Discovery Report Example

```yaml
runtime:
  id: claude-code-local-01
  family: claude-code
  name: Claude Code
  installed: true

  executable:
    name: claude
    path: /usr/local/bin/claude
    source: PATH

  version:
    value: "detected-version"
    confidence: OBSERVED

  authentication:
    status: AUTHENTICATED
    confidence: OBSERVED

  compatibility:
    platform: COMPATIBLE

  capabilities:
    filesystem_access:
      supported: true
      confidence: DECLARED

    shell_access:
      supported: true
      confidence: OBSERVED

    streaming:
      supported: true
      confidence: OBSERVED

  trust_class: L1

  control_profile:
    process_start: true
    process_cancel: true
    internal_tools: false

  observability_profile:
    stdout: true
    stderr: true
    internal_tool_calls: false

  health:
    status: AVAILABLE

  discovered_at:
```

---

# 96. Discovery State Model

The discovery subsystem itself may use:

```text
IDLE
DISCOVERING
PARTIAL
COMPLETED
FAILED
```

`PARTIAL` means one or more detectors failed while useful results remain available.

---

# 97. Discovery Lifecycle

```text
IDLE
 ↓
DISCOVERING
 ↓
Run detectors
 ↓
Aggregate results
 ↓
Normalize
 ↓
Synchronize registry
 ↓
COMPLETED
```

If some detectors fail:

```text
DISCOVERING
 ↓
PARTIAL
 ↓
COMPLETED
```

If the entire discovery operation cannot produce a meaningful report:

```text
DISCOVERING
 ↓
FAILED
```

---

# 98. Discovery Cancellation

Discovery may support cancellation.

Cancellation should stop active probes where technically supported.

Already-completed detector results may remain available.

---

# 99. Discovery Idempotency

Running discovery multiple times should not create duplicate logical runtime records unnecessarily.

Registry synchronization should use stable identity.

Example:

```text
Discovery #1
Claude Code instance A

Discovery #2
Claude Code instance A

Result:
same runtime identity updated
```

---

# 100. Discovery Concurrency

Concurrent discovery requests should avoid corrupting the Runtime Registry.

Possible strategies:

```text
single active discovery
deduplicated discovery
versioned registry updates
transactional registry synchronization
```

Implementation choice belongs to Runtime/Database architecture.

---

# 101. Discovery Race Conditions

Example:

```text
Discovery starts
 ↓
User uninstalls runtime
 ↓
Detector reports installed
 ↓
Registry update occurs
```

The timestamp/provenance should make the observation clear.

Runtime Engine must still validate runtime availability before execution.

---

# 102. Discovery and Execution Race

A runtime can disappear after discovery:

```text
Discovery:
AVAILABLE

Runtime Engine:
execution requested

Runtime:
uninstalled

Execution:
START_FAILURE
```

This is a valid environmental race.

Discovery must not be treated as a permanent guarantee.

---

# 103. Runtime Discovery Security Invariant

Discovery facts do not grant authorization.

```text
DISCOVERY
    ↓
OBSERVATION

NOT:

DISCOVERY
    ↓
AUTHORIZATION
```

---

# 104. Runtime Discovery Trust Invariant

Trust classification must be based on evidence.

Unknown behavior must not be represented as controlled behavior.

---

# 105. Runtime Discovery Capability Invariant

Capabilities describe technical possibility.

They do not grant Agent permissions.

---

# 106. Runtime Discovery Credential Invariant

Discovery must never require exposing raw credentials to the discovery subsystem.

---

# 107. Runtime Discovery Execution Invariant

Discovery cannot execute project work.

---

# 108. Runtime Discovery Adapter Invariant

Runtime-specific discovery logic remains inside detectors/adapters.

---

# 109. Runtime Discovery Registry Invariant

Discovery updates runtime facts.

It does not own runtime execution state.

---

# 110. Runtime Discovery Availability Invariant

Discovery results are time-bound observations.

They must not be treated as permanent runtime guarantees.

---

# 111. Runtime Discovery Failure Invariant

One detector failure should not unnecessarily invalidate unrelated runtime results.

---

# 112. Runtime Discovery Transparency Invariant

Users should be able to understand why a runtime was detected and what is actually known about it.

---

# 113. Runtime Discovery Trust Example

Bad:

```text
Antigravity detected
→ Secure
→ Fully governed
→ All tools controlled
```

Good:

```text
Antigravity detected
→ External CLI
→ Trust L1
→ Process lifecycle observable
→ Internal tool actions not fully observable
→ Internal network behavior not guaranteed controlled
```

The second representation is architecturally honest.

---

# 114. Runtime Discovery Capability Example

Bad:

```text
Runtime supports filesystem
→ Agent may write files
```

Good:

```text
Runtime supports filesystem
        ↓
Capability Resolver
        ↓
Agent permission
        ↓
Project policy
        ↓
Execution authorization
```

---

# 115. Runtime Discovery to Runtime Engine

Canonical relationship:

```text
Runtime Detector
      ↓
Discovery Result
      ↓
Runtime Registry
      ↓
Runtime Resolver
      ↓
Runtime Engine
      ↓
Execution
```

---

# 116. Runtime Discovery to Capability Resolver

Conceptually:

```text
Discovery
   ↓
Runtime Capability Profile
   ↓
Capability Resolver
   ↓
Task-specific authorization
```

Discovery contributes technical facts.

Capability Resolver makes authorization decisions.

---

# 117. Runtime Discovery to Provider Router

Conceptually:

```text
Discovery
   ↓
Runtime supports model/provider selection
   ↓
Provider Router
   ↓
Resolved provider/model
```

Discovery does not select the provider.

---

# 118. Runtime Discovery to Auth System

Conceptually:

```text
Discovery
   ↓
Authentication status observation
   ↓
Auth & Connections
   ↓
Current connection validation
```

Discovery does not own credentials.

---

# 119. Runtime Discovery to Dashboard

Dashboard consumes:

```text
Discovery Report
Runtime Registry
Runtime Health
```

and presents them to the human.

---

# 120. Runtime Discovery to CLI

CLI can expose:

```text
forge runtime discover
forge runtime refresh
forge runtime list
forge runtime inspect <runtime>
forge runtime health <runtime>
```

Complete command semantics belong to the CLI specification.

---

# 121. V0.1 Discovery Scope

The MVP should prove:

```text
automatic local runtime detection
executable resolution
version detection
basic capability metadata
trust/control/observability metadata
basic health
safe authentication-state observation where supported
registry synchronization
CLI visibility
dashboard visibility
```

The exact supported runtime list should remain intentionally small.

---

# 122. V0.1 Discovery Strategy

Prioritize:

```text
Native Forge Runtime
+
one external coding CLI
```

Then add further adapters once the discovery architecture is proven.

Additional runtime support should not be required to validate the core design.

---

# 123. V0.1 Example

```text
$ forge runtime discover

Scanning...

✓ Native Forge Runtime
  Installed: yes
  Version: 0.1
  Trust: L4
  Health: available

✓ External Coding CLI
  Installed: yes
  Version: detected
  Trust: L1
  Health: available

Discovery complete.
2 runtimes registered.
```

---

# 124. Post-MVP Discovery

Future capabilities may include:

- package manager integration
- automatic adapter installation
- remote runtime discovery
- fleet discovery
- enterprise environment inventory
- container runtime discovery
- runtime marketplace metadata
- automatic compatibility remediation

These are post-MVP.

---

# 125. Non-Goals

Runtime Discovery V0.1 is not:

- a package manager
- a software installer
- an authentication manager
- a credential extractor
- a security scanner
- a task executor
- a scheduler
- a provider router
- a model router
- a permission engine
- a sandbox
- a runtime execution engine

---

# 126. Testing Strategy

Runtime Discovery must test:

## Detector Unit Tests

- executable found
- executable missing
- version detected
- version unknown
- authentication detected
- authentication unknown
- capability detection
- malformed runtime output

## Integration Tests

- actual runtime installation
- PATH resolution
- explicit configuration
- platform-specific resolution
- health probe
- registry synchronization

## Failure Tests

- detector timeout
- detector crash
- malformed output
- permission failure
- runtime disappearing during detection
- partial discovery

## Security Tests

- secret exposure
- malicious PATH entry handling
- unsafe executable behavior
- environment-variable leakage
- unbounded scanning

---

# 127. Discovery Test Fixture

A detector should support mocked environments.

Example:

```yaml
fixture:
  executable:
    exists: true
    path: /test/bin/runtime

  version:
    output: "1.0.0"

  authentication:
    status: AUTHENTICATED

  capabilities:
    streaming: true
    filesystem_access: true
```

This allows deterministic detector tests without requiring the actual runtime.

---

# 128. Discovery and Malicious PATH

PATH may contain malicious or unexpected executables.

Discovery should validate runtime identity rather than assuming:

```text
filename == trusted runtime
```

A found executable should be treated as an untrusted observation until validated.

---

# 129. Discovery and Symlinks

Where relevant, discovery may resolve symlink targets to establish executable identity.

It must not follow arbitrary filesystem links without appropriate bounds.

---

# 130. Discovery and Permissions

If executable validation fails due to OS permissions:

```text
installed: UNKNOWN
```

or another accurately represented state should be used.

Do not convert permission failure into:

```text
NOT_INSTALLED
```

without evidence.

---

# 131. Discovery and Runtime Updates

After runtime upgrades:

```text
refresh
 ↓
redetect
 ↓
compare previous facts
 ↓
update registry
```

The system may record changes such as:

```text
version changed
path changed
capability changed
health changed
authentication changed
```

---

# 132. Discovery Change Events

Potential events:

```text
runtime.version_changed
runtime.path_changed
runtime.capabilities_changed
runtime.health_changed
runtime.authentication_changed
runtime.availability_changed
```

These are useful for observability and policy decisions.

---

# 133. Discovery Diff

Forge may compute a discovery diff:

```yaml
change:
  runtime_id:
  field: version
  previous:
  current:
  detected_at:
```

This helps explain environmental changes.

---

# 134. Discovery and Runtime Disablement

If a user disables a runtime:

```text
Detected: YES
Enabled: NO
```

A future discovery refresh must not automatically turn it back on.

Detection and administrative enablement are separate concerns.

---

# 135. Discovery and Uninstallation

If a runtime disappears:

```text
Detected:
NO
```

The registry may retain historical metadata while marking the current runtime instance unavailable/not detected.

History should not be confused with current availability.

---

# 136. Discovery History

The system may retain:

```text
previous discovery reports
runtime changes
detector diagnostics
```

This is useful for debugging.

Retention policy belongs to the broader data architecture.

---

# 137. Discovery Observability Example

A dashboard inspection should be able to answer:

```text
Why is this runtime shown?

Detected by:
PATH

Executable:
...

Version:
detected through --version

Authentication:
unknown

Trust:
L1

Control:
process lifecycle

Observability:
stdout/stderr

Last checked:
...
```

---

# 138. Discovery Quality Rule

> **Never claim more than the environment proves.**

If Forge knows:

```text
"the executable exists"
```

it must not automatically claim:

```text
"the runtime is authenticated, healthy, secure, and authorized."
```

---

# 139. Discovery Architectural Invariants

### Invariant 001 — Observation Only

Discovery observes the environment and does not authorize execution.

### Invariant 002 — No Credential Extraction

Discovery never exposes raw credentials.

### Invariant 003 — Runtime Separation

Discovery discovers runtimes; Runtime Engine executes them.

### Invariant 004 — Capability Separation

Capabilities are technical facts, not permissions.

### Invariant 005 — Trust Separation

Trust Class is distinct from authorization and security policy.

### Invariant 006 — Honest Governance

Opaque external runtimes must retain their actual control/observability limitations.

### Invariant 007 — Partial Knowledge

Unknown values remain unknown.

### Invariant 008 — Detector Isolation

A detector failure should not unnecessarily prevent unrelated discovery.

### Invariant 009 — Safe Probing

Detection must be bounded and non-destructive.

### Invariant 010 — No Silent Installation

Discovery does not install runtimes.

### Invariant 011 — Registry Separation

Discovery updates runtime facts; Runtime Engine owns execution lifecycle.

### Invariant 012 — Time-Bound Observation

Discovery results are observations with timestamps.

### Invariant 013 — No Authorization Shortcut

Detected/healthy/authenticated does not imply authorized.

### Invariant 014 — Adapter Isolation

Runtime-specific detection logic remains isolated in detectors/adapters.

### Invariant 015 — Extensibility

New runtime discovery support should be addable without rewriting the core discovery architecture.

---

# 140. Dependency Map

```text
08 Runtime Discovery
│
├── depends on
│   ├── 02 System Architecture
│   ├── 06.5 Architectural Decisions
│   └── 07 Runtime Engine
│
├── integrates with
│   ├── 09 Provider Router
│   ├── 10 Auth & Connections
│   ├── Security Policy
│   ├── Capability Resolver
│   └── Runtime Registry
│
└── consumed by
    ├── Runtime Engine
    ├── Runtime Resolver
    ├── CLI
    └── Dashboard
```

---

# 141. Implementation Boundary

Runtime Discovery contains:

```text
detectors
executable resolution
version probing
safe authentication probing
capability probing
trust/control/observability profiling
health probing
result normalization
discovery reporting
registry synchronization
```

It does not contain:

```text
runtime execution
task scheduling
task state
agent lifecycle
credential storage
authorization
verification
provider routing
```

---

# 142. Recommended V0.1 Module Structure

Conceptually:

```text
src/
└── runtime-discovery/
    ├── discovery-coordinator
    ├── detector-registry
    ├── detectors/
    │   ├── native-forge
    │   ├── external-cli
    │   └── ...
    ├── executable-resolver
    ├── version-resolver
    ├── auth-probe
    ├── capability-prober
    ├── profile-builder
    ├── health-prober
    ├── result-normalizer
    └── discovery-reporter
```

Names are implementation guidance, not mandatory file names.

---

# 143. Runtime Discovery Contract Summary

```text
ENVIRONMENT
    ↓
DETECT
    ↓
VALIDATE
    ↓
OBSERVE
    ↓
PROFILE
    ↓
NORMALIZE
    ↓
REGISTER
```

Then:

```text
Runtime Registry
    ↓
Runtime Resolver
    ↓
Capability Resolver
    ↓
Runtime Engine
```

---

# 144. Final Runtime Discovery Model

```text
HOST ENVIRONMENT
      │
      ▼
┌─────────────────────┐
│ Runtime Discovery   │
├─────────────────────┤
│ Detectors           │
│ Executable Resolver │
│ Version Probe       │
│ Auth Probe          │
│ Capability Probe    │
│ Trust Profile       │
│ Control Profile     │
│ Observability       │
│ Health Probe        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Runtime Registry    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Runtime Resolver    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Capability Resolver │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Runtime Engine      │
└──────────┬──────────┘
           │
           ▼
       Execution
```

---

# 145. Final Principle

> **Runtime Discovery tells Forge what exists.**
>
> **Runtime Registry remembers what was observed.**
>
> **Runtime Resolver determines what can be considered for execution.**
>
> **Capability Resolver determines what is allowed.**
>
> **Runtime Engine performs the execution.**

The purpose of Runtime Discovery is therefore not merely to answer:

> "Is Claude Code installed?"

It must progressively answer:

> "What runtime exists, where is it, what version is it, what can it technically do, what can Forge observe/control, what is its trust boundary, what is its current health/authentication state, and what evidence supports those claims?"

That information becomes the foundation for reliable runtime selection without pretending that detection equals authorization or that an external runtime is more controlled than it actually is.
