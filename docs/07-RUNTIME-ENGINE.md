# 07 — RUNTIME ENGINE

**Forge Wanzz — AI Software Factory**  
**Version:** 0.1  
**Status:** Canonical Detailed Specification  
**Depends On:** 00 Product Thesis, 01 Master PRD, 02 System Architecture, 03 Agent System, 05 Orchestration Engine, 06 Task Engine, 06.5 Architectural Decisions

---

## 1. Purpose

The Runtime Engine is the execution abstraction and lifecycle manager that allows Forge Wanzz agents to perform work through interchangeable execution runtimes.

Forge does not need to replace every existing AI coding runtime. Instead, Forge provides a common execution control plane around runtimes such as coding CLIs, native Forge runners, and future runtime implementations.

The Runtime Engine translates an authorized, capability-resolved execution request into a runtime-specific execution, observes its lifecycle, captures its result, and reports the outcome to the rest of Forge.

The Runtime Engine does not decide what the project should build, which task should execute, whether a task is complete, or whether the resulting software is correct.

Its responsibility is execution.

---

# 2. Core Definition

## 2.1 Runtime

A **Runtime** is an execution environment capable of performing work requested by an Agent.

Examples include:

- AI coding CLI
- native Forge execution runner
- external development CLI
- local AI agent runtime
- future remote execution worker

A runtime may internally invoke models, tools, shells, filesystems, networks, or other capabilities.

Those internal behaviors may or may not be observable or governable by Forge.

---

## 2.2 Runtime Engine

The **Runtime Engine** manages the lifecycle and execution boundary of registered runtimes.

It is responsible for:

- runtime registration
- runtime resolution
- adapter management
- execution preparation
- execution startup
- process lifecycle
- execution monitoring
- output collection
- cancellation
- timeout handling
- runtime health
- runtime failure reporting
- crash recovery support
- runtime observability
- runtime execution audit events

---

## 2.3 Runtime Adapter

A **Runtime Adapter** translates Forge's canonical runtime execution contract into the invocation and lifecycle semantics of a specific runtime.

The adapter isolates runtime-specific implementation details from the rest of Forge.

Conceptually:

```text
Forge Execution Contract
        ↓
Runtime Adapter
        ↓
Runtime-Specific Invocation
```

---

# 3. Fundamental Distinctions

Forge maintains explicit boundaries between:

```text
Agent
Skill
Task
Runtime
Model
Provider
Tool
Capability
Permission
Trust
Execution
Verification
```

These concepts must not be collapsed into a single abstraction.

---

## 3.1 Runtime ≠ Agent

An Agent defines responsibility.

A Runtime provides execution.

```text
Agent
  ↓
Runtime Strategy
  ↓
Runtime Engine
  ↓
Runtime Adapter
  ↓
Runtime
```

An Agent may prefer or require a runtime, but it does not own the Runtime Engine.

---

## 3.2 Runtime ≠ Model

A model provides inference/reasoning capability.

A runtime provides an environment through which work is executed.

Example:

```text
Runtime:
Claude Code CLI

Model:
Claude model

Provider:
Anthropic
```

A runtime may internally select or invoke a model, but Forge must retain separate conceptual representations for Runtime, Model, and Provider.

---

## 3.3 Runtime ≠ Provider

A Provider is the source or service through which model inference is made available.

Provider selection and model routing belong to the Provider Router.

The Runtime Engine consumes resolved model/provider configuration when execution requires it.

---

## 3.4 Runtime ≠ Task

A Task represents work that must be completed.

A Runtime performs an execution associated with a Task.

The Task Engine remains the authoritative owner of:

- Task definition
- Task state
- Task DAG
- dependencies
- leases
- durable task persistence

Runtime Engine must not directly mutate Task state.

---

## 3.5 Runtime ≠ Tool

A Tool is a capability exposed to an Agent or runtime.

The Tool Execution Engine owns Forge-mediated tool execution.

An opaque external runtime may internally execute tools outside Forge's mediation boundary.

Forge must accurately disclose this limitation.

---

## 3.6 Runtime ≠ Verification

Runtime Engine reports execution results.

Verification Engine determines whether produced work satisfies verification requirements.

An execution finishing successfully does not mean the Task is verified.

---

# 4. Runtime Engine Responsibilities

The Runtime Engine owns the runtime execution lifecycle.

Its responsibilities include:

1. Maintaining runtime execution abstractions.
2. Managing runtime adapters.
3. Resolving runtime implementations from authorized runtime requests.
4. Preparing runtime executions.
5. Starting runtime processes.
6. Monitoring runtime processes.
7. Capturing runtime output.
8. Tracking runtime execution state.
9. Handling runtime cancellation.
10. Handling runtime timeout.
11. Detecting runtime crashes and loss.
12. Supporting crash recovery.
13. Managing runtime health information.
14. Normalizing runtime results.
15. Publishing runtime execution events.
16. Producing runtime execution audit information.
17. Exposing runtime execution state to consumers such as the CLI and dashboard.

---

# 5. Runtime Engine Non-Responsibilities

The Runtime Engine does not own:

| Responsibility | Owner |
|---|---|
| Project management | Project Manager |
| Goal definition | Human / Project Manager |
| Planning | Orchestrator |
| Organization formation | Organization Manager |
| Agent lifecycle | Agent Engine |
| Skill definitions | Skill Engine |
| Task definition/state/DAG | Task Engine |
| Scheduling | Orchestrator |
| Capability authorization | Capability Resolver |
| Security policy | Security Policy Authority |
| Model/provider routing | Provider Router |
| Credential/connection management | Auth & Connections |
| Forge-mediated tool execution | Tool Execution Engine |
| Verification verdict | Verification Engine |
| Semantic review | Reviewer Agent |
| Artifact persistence authority | Artifact Store |
| Human approval | Approval Manager / Human Operator |
| Global event architecture | Event System |

Runtime Engine integrates with these systems without taking ownership of their domains.

---

# 6. Runtime Architecture

The Runtime Engine is conceptually composed of:

```text
Runtime Engine
│
├── Runtime Registry
├── Runtime Resolver
├── Runtime Adapter Manager
├── Execution Manager
├── Process Manager
├── Runtime Health Monitor
├── Output Collector
├── Cancellation Manager
├── Timeout Manager
└── Runtime Event Publisher
```

These are logical responsibilities, not necessarily separate deployable services.

For V0.1 they should remain implementable inside the local-first modular monolith.

---

# 7. Runtime Registry

The Runtime Registry represents runtimes known to Forge.

A runtime registration may contain:

```yaml
runtime:
  id:
  name:
  version:
  adapter:
  trust_class:
  executable:
  capabilities:
  platform:
  status:
  health:
  authentication:
  control_profile:
  observability_profile:
  security_profile:
```

Not every runtime is required to provide every field.

The registry must distinguish detected facts from inferred or configured metadata.

---

# 8. Runtime Identity

A runtime identity should distinguish:

- stable runtime identifier
- adapter identifier
- runtime name
- executable identity
- detected version
- installation path where applicable
- host/environment
- runtime instance identity

Stable identity must not depend solely on display names.

Two installations of the same runtime may be distinct runtime instances.

---

# 9. Runtime Discovery Boundary

Runtime discovery is specified in:

`08-RUNTIME-DISCOVERY.md`

Runtime Engine consumes discovery results and integrates them into runtime registration.

Conceptually:

```text
Runtime Discovery
       ↓
Runtime Registry
       ↓
Runtime Engine
```

Runtime Engine must not duplicate the complete discovery mechanism.

Discovery determines what appears to exist.

Runtime Engine determines how a registered runtime can participate in execution.

---

# 10. Runtime Adapter

Each supported runtime is integrated through an adapter.

A conceptual adapter contract is:

```ts
interface RuntimeAdapter {
  id: string

  detect(): Promise<DetectionResult>

  getVersion(): Promise<string>

  getStatus(): Promise<RuntimeStatus>

  capabilities(): Promise<RuntimeCapabilities>

  authenticate(): Promise<AuthStatus>

  prepare(
    request: RuntimeExecutionRequest
  ): Promise<PreparedExecution>

  execute(
    request: RuntimeExecutionRequest
  ): Promise<RuntimeExecution>

  cancel(
    executionId: string
  ): Promise<void>

  healthCheck(): Promise<HealthStatus>
}
```

The exact implementation may differ by runtime.

The adapter must not:

- mutate Task Engine state
- override Security Policy
- grant permissions
- declare verification success

---

# 11. Adapter Responsibilities

An adapter encapsulates runtime-specific details such as:

- executable discovery
- command construction
- runtime-specific flags
- environment construction
- invocation mode
- interactive/non-interactive behavior
- output normalization
- exit code interpretation
- cancellation semantics
- health checks
- runtime-specific diagnostics

The rest of Forge should not need to know the command syntax of every runtime.

---

# 12. Runtime Capabilities

A runtime may declare technical capabilities such as:

```text
interactive
non_interactive
streaming
filesystem_access
shell_access
network_access
git_access
browser_access
structured_output
json_output
checkpointing
cancellation
timeout
sandboxing
model_selection
tool_calling
mcp_support
```

These capabilities describe what the runtime can technically perform.

They are not permissions.

For example:

```text
Runtime Capability:
filesystem_access

Does NOT mean:

Agent Permission:
filesystem_write = ALLOWED
```

Authorization remains the responsibility of Capability Resolver and Security Policy.

---

# 13. Trust, Security, Control, and Observability Profiles

Forge separates:

```text
Trust Class
Security Profile
Control Profile
Observability Profile
Capability Profile
Permission Policy
```

These concepts must not be collapsed.

---

## 13.1 Trust Class

The canonical Trust Classes are:

```text
L0 — Unknown
L1 — Trusted External
L2 — Governed External
L3 — Sandboxed
L4 — Native Forge Controlled
```

Trust Class describes the execution trust boundary.

It does not automatically grant permission.

---

## 13.2 Security Profile

Describes relevant security characteristics of the runtime.

Examples:

- process isolation
- filesystem restrictions
- network restrictions
- credential exposure characteristics
- sandboxing
- host access

---

## 13.3 Control Profile

Describes what Forge can technically control.

Examples:

```text
process lifecycle
stdin
stdout
stderr
cancellation
filesystem boundary
network boundary
tool mediation
runtime configuration
```

An opaque runtime may have limited control.

---

## 13.4 Observability Profile

Describes what Forge can observe.

Examples:

```text
process status
stdout
stderr
structured output
tool events
progress
exit status
internal actions
```

A runtime may have high execution capability but low internal observability.

---

## 13.5 Capability Profile

Describes technical runtime capabilities.

It is not an authorization profile.

---

# 14. Runtime Trust Classes

## L0 — Unknown

Runtime origin or behavior is not sufficiently established.

Forge should treat such runtimes conservatively.

---

## L1 — Trusted External

A locally installed external runtime is executed with substantial host privileges.

Forge may control its invocation boundary but cannot necessarily observe or govern every internal action.

Example:

```text
Forge
  ↓
External CLI
  ↓
Internal shell/filesystem/network actions
```

---

## L2 — Governed External

Forge has additional mediation or control through mechanisms supported by the runtime.

Possible mechanisms include:

- PTY/IPC
- controlled flags
- MCP
- path restrictions
- explicit tool interfaces

The exact governance guarantees depend on the adapter.

---

## L3 — Sandboxed

Runtime execution is constrained by an execution sandbox.

The exact sandbox technology is implementation-specific.

---

## L4 — Native Forge Controlled

Runtime executes through a Forge-controlled execution environment.

Forge can provide stronger lifecycle, workspace, resource, and security controls.

---

# 15. Runtime Selection

Runtime selection determines which available runtime should execute a request.

Selection may consider:

- Agent runtime strategy
- Task requirements
- required capabilities
- runtime capabilities
- trust requirements
- security requirements
- project policy
- platform compatibility
- runtime availability
- runtime health
- model/provider requirements
- fallback policy

Runtime selection does not grant authorization.

The selected runtime must still pass capability and policy validation.

---

# 16. Runtime Strategy

An Agent or execution policy may express:

```yaml
runtime_strategy:
  mode: auto
  preferred:
    - runtime-a
    - runtime-b
  fallback:
    - runtime-c
  required_capabilities:
    - filesystem_access
    - non_interactive
  minimum_trust_class:
    - L2
```

Runtime Strategy is a selection preference/requirement.

It is not a permission system.

---

# 17. Execution Request

The canonical runtime execution request represents the request to execute work through a runtime.

Conceptually:

```yaml
execution:
  id:
  task_id:
  agent_id:
  project_id:
  runtime_id:
  runtime_adapter:
  workspace:
  command:
  arguments:
  environment:
  model:
  provider:
  capabilities:
  execution_token:
  timeout:
  cancellation_policy:
  output_policy:
  approval_context:
```

The exact transport is implementation-specific.

---

# 18. Execution Request Validation

Before execution:

```text
Execution Request
       ↓
Identity validation
       ↓
Runtime availability
       ↓
Runtime capability validation
       ↓
ExecutionToken validation
       ↓
Workspace validation
       ↓
Security / project policy validation
       ↓
Runtime preparation
       ↓
Runtime launch
```

Failures must prevent execution when the relevant requirement is not satisfied.

---

# 19. Capability Resolution Boundary

Capability Resolver provides the authorization result before runtime execution.

Conceptually:

```text
Task
 ↓
Required Capabilities
 ↓
Agent Capabilities
 ↓
Skill Requirements
 ↓
Tool Requirements
 ↓
Runtime Capabilities
 ↓
Project Policy
 ↓
Permission Policy
 ↓
Capability Resolution
 ↓
ALLOWED / DENIED / APPROVAL REQUIRED
 ↓
ExecutionToken
 ↓
Runtime Engine
```

Runtime Engine consumes the resulting authorization.

It must not bypass the Capability Resolver for Forge-controlled execution paths.

For opaque external runtimes, the token authorizes the Forge invocation boundary and does not guarantee control over all internal runtime behavior.

---

# 20. ExecutionToken

An ExecutionToken is an authorization artifact produced by the capability/security layer for a permitted execution.

The Runtime Engine must validate relevant token properties before launching a Forge-controlled execution.

At minimum, token validation should establish:

- token authenticity
- execution identity
- runtime binding where applicable
- project/task/agent binding where applicable
- capability scope
- expiration
- policy context

The ExecutionToken authorizes the Forge execution boundary.

It must never be interpreted as proof that an opaque external runtime is fully governed internally.

---

# 21. Execution Lifecycle

Runtime execution has its own lifecycle.

Canonical runtime states:

```text
REQUESTED
VALIDATING
PREPARING
STARTING
RUNNING
CANCELLING
CANCELLED
COMPLETED
FAILED
TIMED_OUT
CRASHED
LOST
```

These states describe runtime execution.

They are not Task states.

---

# 22. Runtime State vs Task State

Example:

```text
Runtime:
RUNNING

Task:
IN_PROGRESS
```

Another example:

```text
Runtime:
FAILED

Task:
RETRYABLE
```

or:

```text
Runtime:
TIMED_OUT

Task:
FAILED
```

The mapping from runtime outcome to authoritative Task state is determined by the Task Engine and orchestration/recovery policies.

Runtime Engine reports facts about runtime execution.

---

# 23. Execution State Rules

A runtime execution must have one authoritative current state.

State transitions must be validated.

Terminal states:

```text
CANCELLED
COMPLETED
FAILED
TIMED_OUT
CRASHED
LOST
```

A terminal runtime execution must not be restarted under the same execution identity.

A retry should create or be associated with a new execution attempt according to the Task/Orchestration contract.

---

# 24. Process Management

For local execution, Runtime Engine manages the lifecycle of processes it starts where technically supported.

Relevant information includes:

- process ID
- parent process
- child processes
- process group
- execution ID
- runtime ID
- workspace
- start time
- exit time
- exit code
- signal
- process status

---

# 25. Process Groups

Process groups are important for cancellation and recovery because a runtime may spawn child processes.

Conceptually:

```text
Execution
   ↓
Runtime Process
   ├── Child Process
   ├── Child Process
   └── Child Process
```

Runtime Engine should track process groups where the platform supports them.

Forge minimizes and deterministically recovers Forge-managed process groups where technically supported.

It must not claim universal control over arbitrary processes.

---

# 26. Runtime Preparation

Before starting execution, Runtime Engine may perform:

- runtime availability validation
- workspace validation
- environment construction
- adapter-specific preparation
- command preparation
- policy checks
- output configuration
- process configuration

Preparation must not mutate Task state.

---

# 27. Command Construction

Adapters translate the canonical execution request into runtime-specific invocation.

Forge must not assume all runtimes use the same command-line contract.

For example, runtimes may differ in:

- prompt arguments
- configuration flags
- interactive modes
- authentication mechanisms
- working directory flags
- output formats
- model selection flags

Adapter-specific details remain inside the adapter.

---

# 28. Runtime Process Startup

Startup should:

1. Validate the prepared execution.
2. Establish the execution identity.
3. Create the configured environment.
4. Establish the working directory.
5. Start the runtime process.
6. Record process identity.
7. Begin output collection.
8. Begin monitoring.
9. Publish the execution-started event.

If startup fails, Runtime Engine records a structured runtime failure.

---

# 29. Output Collection

Runtime Engine may collect:

```text
stdout
stderr
structured output
runtime events
progress
exit status
diagnostics
artifact references
```

Output handling should support:

- streaming
- buffering
- persistence
- truncation
- size limits
- safe redaction

The Event System remains responsible for the broader event architecture.

---

# 30. Secret Redaction

Runtime Engine must avoid exposing secrets through:

- stdout persistence
- stderr persistence
- dashboard output
- event payloads
- diagnostics
- error messages

Credential storage remains outside Runtime Engine.

If a runtime unexpectedly emits a secret, the system should apply the available redaction policy before exposing or persisting the output where technically possible.

---

# 31. Runtime Events

Runtime Engine may publish events such as:

```text
runtime.execution.requested
runtime.execution.validating
runtime.execution.started
runtime.execution.output
runtime.execution.progress
runtime.execution.completed
runtime.execution.failed
runtime.execution.cancelled
runtime.execution.timeout
runtime.execution.crashed
runtime.execution.lost
```

Events are observations/signals.

They do not replace authoritative Task state.

---

# 32. Heartbeat

Runtime executions may expose heartbeat information:

```text
execution_id
last_heartbeat
heartbeat_status
```

Heartbeat helps detect stale or lost executions.

Task Engine owns authoritative task leases.

Runtime heartbeat and Task leases must remain conceptually distinct.

---

# 33. Timeout

Runtime Engine should support timeout policies where the runtime/platform permits them.

Possible timeout categories:

```text
startup timeout
execution timeout
idle timeout
cancellation grace period
forced termination timeout
```

Timeout values should be configuration/policy rather than arbitrary hardcoded architecture.

A timeout produces a runtime execution outcome.

Task recovery remains outside Runtime Engine.

---

# 34. Cancellation

Cancellation lifecycle:

```text
Cancellation Requested
        ↓
Graceful Termination
        ↓
Grace Period
        ↓
Forced Termination
        ↓
Cleanup
        ↓
CANCELLED
```

Where runtime/platform support differs, the adapter defines the appropriate mechanism.

Cancellation must be idempotent.

Runtime Engine does not directly mutate Task state.

---

# 35. Failure Classification

Runtime failures should be structured.

Canonical categories include:

```text
INVALID_REQUEST
UNAUTHORIZED
RUNTIME_NOT_FOUND
RUNTIME_UNAVAILABLE
START_FAILURE
PROCESS_FAILURE
TIMEOUT
CANCELLED
CRASH
LOST_PROCESS
OUTPUT_FAILURE
WORKSPACE_FAILURE
RESOURCE_FAILURE
UNKNOWN
```

Failure details should include safe diagnostics.

They must not expose credentials or unnecessary sensitive environment information.

---

# 36. Runtime Failure vs Task Failure

Runtime Engine reports:

```text
runtime failure
```

Task Engine determines:

```text
task failure
retryability
pause
blocked state
replanning
human escalation
```

A runtime failure is evidence for the higher-level task state machine, not a direct command to mutate it.

---

# 37. Crash Handling

Runtime Engine must account for:

- runtime crash
- child process crash
- process disappearance
- output stream failure
- Forge process crash
- stale execution record
- missing process
- process without a valid execution record

The goal is to preserve execution integrity and provide sufficient evidence for recovery.

---

# 38. Forge Crash Recovery

Crash integrity precedes resumption.

On Forge startup:

```text
Inspect durable execution records
        ↓
Inspect process state
        ↓
Inspect workspace integrity
        ↓
Validate checkpoint if available
        ↓
Determine:
resume / retry / rollback / escalate
```

A checkpoint alone is not sufficient evidence for automatic resume.

The system must first validate relevant process, workspace, and execution integrity.

---

# 39. Orphan Process Handling

An orphan process may exist when:

```text
Process exists
but
Forge execution record is missing, stale, or invalid
```

Runtime Engine should:

1. Detect candidate orphan processes.
2. Verify ownership where technically possible.
3. Associate them with known execution identities when possible.
4. Apply configured termination/recovery policy.
5. Record the action.
6. Avoid terminating unrelated user processes.

Universal orphan-process termination guarantees must not be claimed.

---

# 40. Workspace Integration

Runtime Engine executes within the workspace supplied by the workspace architecture.

Locked workspace policy:

```text
Read-only shared workspace
        ↓
Single writer may use direct workspace where appropriate
        ↓
Concurrent writers require isolated Git worktrees
```

Runtime Engine does not own workspace orchestration.

It receives a validated workspace boundary and executes within it.

---

# 41. Runtime and Git Worktrees

When a task is assigned an isolated worktree:

```text
Task
 ↓
Workspace Manager
 ↓
Git Worktree
 ↓
Runtime Engine
 ↓
Runtime
```

Runtime Engine must use the supplied worktree rather than creating an independent competing workspace unless explicitly requested by the workspace contract.

---

# 42. External CLI Runtime

External CLI integration:

```text
Forge
  ↓
Runtime Adapter
  ↓
External CLI
  ↓
CLI internal execution
```

Forge may control:

- invocation
- process lifecycle where supported
- working directory
- selected environment
- output collection
- cancellation where supported
- configured runtime flags

Forge may NOT automatically control every internal action of the CLI.

The adapter must declare actual governance and observability capabilities.

---

# 43. External CLI Governance

Where technically supported, Forge may use:

- MCP
- explicit tool interfaces
- runtime flags
- PTY/IPC
- path restrictions
- sandboxing
- process-group management

These mechanisms provide different levels of control.

The architecture must never represent an external runtime as more governed than it actually is.

---

# 44. Runtime Security Boundary

Runtime security depends on:

```text
Runtime Trust Class
+
Security Profile
+
Control Profile
+
Project Policy
+
Permission Policy
+
Capability Resolution
```

Runtime Engine participates in enforcement at the execution boundary.

Security Policy Authority remains the policy owner.

---

# 45. Environment Construction

Runtime Engine may construct a scoped environment for execution.

The environment may include:

- required runtime configuration
- workspace configuration
- scoped provider configuration
- execution metadata
- non-secret runtime options

Secrets should be injected only where authorized and necessary.

Secrets must not be unnecessarily persisted.

---

# 46. Authentication Boundary

Authentication and connection management belong primarily to:

`10-AUTH-CONNECTIONS.md`

Runtime Engine may consume:

```text
authentication status
connection reference
scoped credential configuration
```

Runtime Engine must not invent an independent credential store.

It must never bypass authentication policy.

---

# 47. Provider / Model Integration

The Provider Router is responsible for provider/model routing.

Conceptually:

```text
Agent / Task Requirement
        ↓
Provider Router
        ↓
Resolved Model + Provider
        ↓
Runtime Engine
        ↓
Runtime Adapter
```

Runtime Engine may pass model/provider configuration to a runtime when supported.

It does not become the Provider Router.

---

# 48. Tool Integration

Forge-mediated tool execution belongs to Tool Execution Engine.

Conceptually:

```text
Agent
 ↓
Tool Execution Engine
 ↓
Tool
```

A runtime may also have its own internal tool execution:

```text
Runtime
 ↓
Internal Tool
```

If Forge cannot intercept the latter, that limitation must be represented through runtime trust/control/observability metadata.

---

# 49. Runtime Health

Runtime health is observational.

Possible health states:

```text
UNKNOWN
AVAILABLE
DEGRADED
UNAVAILABLE
AUTH_REQUIRED
MISCONFIGURED
```

Health does not imply authorization.

A runtime may be:

```text
healthy
but unauthorized
```

or:

```text
authorized
but unavailable
```

---

# 50. Runtime Availability

Forge should distinguish:

```text
installed
detected
authenticated
available
healthy
authorized
selected
running
```

These states must not be collapsed into a single boolean.

Example:

```text
Installed: YES
Detected: YES
Authenticated: NO
Available: NO
Authorized: NO
```

---

# 51. Runtime Versioning

Runtime metadata should distinguish:

```text
runtime version
adapter version
compatibility status
```

Version detection may fail.

A failed version check must be represented explicitly rather than converted into a false version.

---

# 52. Platform Compatibility

Runtime compatibility may depend on:

- operating system
- CPU architecture
- shell
- filesystem
- environment
- installed dependencies

The Runtime Adapter should expose compatibility information where possible.

The architecture must remain extensible to future remote execution.

---

# 53. Runtime Session

The following concepts are distinct:

```text
Runtime Instance
Execution
Session
Process
Task
Agent
```

A Runtime Instance is an available installation/environment.

An Execution is one invocation of that runtime.

A Session may represent a runtime interaction context where supported.

A Process is an operating-system execution entity.

A Task is the unit of work owned by Task Engine.

An Agent is the execution identity/responsibility.

---

# 54. Interactive and Non-Interactive Execution

Runtime Engine should support both interaction modes where technically possible.

Examples:

```text
Interactive CLI
Non-interactive CLI
Streaming runtime
Batch runtime
```

The adapter declares supported modes.

Forge must not assume all runtimes support interactive execution.

---

# 55. Runtime Result

Runtime Engine normalizes runtime completion into a canonical result.

Conceptually:

```yaml
runtime_result:
  execution_id:
  status:
  exit_code:
  started_at:
  completed_at:
  stdout:
  stderr:
  structured_output:
  artifacts:
  diagnostics:
  runtime_metadata:
```

A runtime result describes what happened during execution.

It does not constitute verification.

---

# 56. Artifacts

A runtime may produce artifacts such as:

- files
- logs
- reports
- generated assets
- structured output
- patches
- diagnostics

Runtime Engine reports artifact references.

Artifact persistence and lifecycle remain governed by the Artifact Store architecture.

---

# 57. Observability

Runtime observability should expose, where available:

```text
Runtime identity
Runtime version
Adapter
Trust Class
Capabilities
Health
Execution ID
Process state
Start time
Duration
Workspace
Output
Exit code
Failure diagnostics
Execution events
```

Observability must respect security and secret-redaction policy.

---

# 58. Auditability

Important runtime actions should produce durable audit information.

Examples:

```text
runtime registered
runtime selected
execution authorized
execution started
execution cancelled
execution timed out
execution crashed
execution completed
execution failed
runtime unavailable
runtime governance limitation detected
```

The physical implementation of the authoritative audit store belongs to the Event/Database/Security specifications.

This document defines the required audit semantics, not a permanent storage technology.

---

# 59. Idempotency

Runtime operations that may be retried must define idempotency behavior.

Important operations:

```text
start execution
cancel execution
cleanup execution
submit result
recover execution
```

Repeated cancellation must not create inconsistent states.

Repeated start requests must not accidentally create duplicate processes under the same execution identity.

---

# 60. Concurrency

Runtime Engine may manage multiple concurrent runtime executions.

Concurrency must consider:

- runtime-specific concurrency limits
- project limits
- process limits
- CPU/memory availability
- workspace isolation
- security policy
- runtime capability constraints

Global scheduling remains the Orchestrator's responsibility.

---

# 61. Resource Limits

Where technically supported, Runtime Engine may enforce or expose:

```text
CPU
memory
process count
disk
execution duration
output size
```

Global project resource allocation remains a higher-level policy/scheduling concern.

---

# 62. Runtime Fallback

Runtime fallback may occur when the preferred runtime cannot safely execute a request.

Conceptually:

```text
Preferred Runtime
       ↓
Unavailable / Incompatible
       ↓
Evaluate Fallback Candidates
       ↓
Capability Resolution
       ↓
Policy Validation
       ↓
Select Fallback
       ↓
Execute
```

Fallback must preserve task requirements and security/trust requirements.

---

# 63. No Silent Security Downgrade

A fallback must not silently weaken:

- trust requirements
- security requirements
- capability requirements
- workspace restrictions
- approval requirements

If the fallback changes the security posture materially, the relevant policy may require human approval or rejection.

---

# 64. Runtime Execution Contract

The Runtime Engine exposes a conceptual contract:

```text
Caller
  ↓
RuntimeExecutionRequest
  ↓
Runtime Engine
  ↓
RuntimeExecutionResult
```

During execution:

```text
RuntimeExecutionEvent
```

On failure:

```text
RuntimeExecutionError
```

The contract must remain runtime-agnostic.

---

# 65. Runtime Execution API

Conceptual service operations include:

```text
registerRuntime()
getRuntime()
listRuntimes()
getRuntimeHealth()
resolveRuntime()
prepareExecution()
startExecution()
getExecution()
streamExecutionOutput()
cancelExecution()
recoverExecution()
```

These are application/service concepts.

They do not require an HTTP API in V0.1.

---

# 66. Runtime Registration API

Conceptual operations:

```text
registerRuntime(runtime)
updateRuntime(runtime)
getRuntime(runtimeId)
listRuntimes()
removeRuntime(runtimeId)
```

Registration must preserve runtime identity and provenance.

---

# 67. Execution API

Conceptual operations:

```text
prepareExecution(request)
startExecution(preparedExecution)
getExecution(executionId)
streamExecutionOutput(executionId)
cancelExecution(executionId)
recoverExecution(executionId)
```

Execution operations must be auditable.

---

# 68. CLI Integration

Forge CLI may expose runtime operations such as:

```text
forge runtime list
forge runtime status
forge runtime inspect
forge runtime health
forge runtime test
forge execution inspect
forge execution cancel
```

These are conceptual commands.

The complete CLI specification belongs to:

`15-CLI-SPECIFICATION.md`

---

# 69. Dashboard Integration

The dashboard may display:

```text
Runtime
Version
Adapter
Trust Class
Health
Status
Capabilities
Current Executions
Recent Executions
Execution Output
Failure Diagnostics
```

The dashboard consumes Runtime Engine information.

It does not become the runtime authority.

---

# 70. Error Model

Runtime errors should be:

- structured
- machine-readable
- human-readable
- auditable
- safe to display

Errors should distinguish:

```text
runtime unavailable
authorization failure
startup failure
process failure
timeout
cancellation
workspace failure
resource failure
unknown failure
```

Error messages must not leak secrets.

---

# 71. Testing Requirements

Runtime Engine must be tested at several levels.

## Unit Tests

Test:

- adapter behavior
- request validation
- state transitions
- timeout handling
- cancellation
- result normalization
- failure normalization

## Integration Tests

Test:

- real local runtime
- process lifecycle
- stdout/stderr
- workspace execution
- runtime health
- cancellation
- timeout

## Recovery Tests

Test:

- Forge crash
- runtime crash
- child process crash
- orphan process
- stale execution
- duplicate execution request
- recovery decisions

## Security Tests

Test:

- invalid ExecutionToken
- expired ExecutionToken
- denied capability
- workspace escape
- secret leakage
- unauthorized runtime selection

---

# 72. Simulation and Dry Run

Runtime Engine should support lightweight simulated execution for testing higher-level orchestration without invoking real external processes.

A mock runtime may provide:

```text
success
failure
timeout
cancellation
crash
slow execution
structured output
```

Simulation must not be confused with real runtime health.

---

# 73. MVP Runtime Engine

V0.1 must demonstrate the following path:

```text
Runtime Discovery
      ↓
Runtime Registration
      ↓
Runtime Selection
      ↓
Capability Resolution
      ↓
ExecutionToken Validation
      ↓
Workspace Preparation
      ↓
Runtime Launch
      ↓
Process Monitoring
      ↓
Output Collection
      ↓
Runtime Result
      ↓
Verification
```

The MVP remains:

```text
single-node
local-first
Node.js
modular monolith
SQLite WAL
CLI + Dashboard
```

---

# 74. MVP Runtime Scope

The current architecture permits an MVP runtime scope centered on:

```text
L4 Native Forge Controlled Runtime
L1 Claude Code CLI
```

The adapter architecture must allow additional runtimes later.

Do not make every possible runtime a V0.1 requirement.

---

# 75. MVP End-to-End Example

```text
Human Goal
    ↓
Orchestrator
    ↓
Task Engine
    ↓
Agent
    ↓
Runtime Strategy
    ↓
Capability Resolver
    ↓
ExecutionToken
    ↓
Runtime Engine
    ↓
Claude Code Adapter
    ↓
Claude Code CLI
    ↓
Git Worktree
    ↓
Runtime Execution
    ↓
Runtime Result
    ↓
Verification Engine
    ↓
Task Engine
```

Authority boundaries:

```text
Orchestrator
→ decides coordination/scheduling

Task Engine
→ owns task state

Agent Engine
→ owns agent identity/capability

Capability Resolver
→ authorizes execution

Runtime Engine
→ manages runtime execution

Runtime Adapter
→ translates invocation

Verification Engine
→ verifies result
```

---

# 76. Complex Runtime Example

Consider a project where:

```text
Architect Agent
→ Native Forge Runtime

Developer Agent
→ External Coding CLI

Reviewer Agent
→ Native Verification/Reviewer Runtime
```

The system may execute independent tasks concurrently.

Each concurrent writer receives an isolated worktree.

Conceptually:

```text
Task A
  ↓
Architect Agent
  ↓
Native Runtime
  ↓
Worktree A

Task B
  ↓
Developer Agent
  ↓
External Runtime
  ↓
Worktree B

Task C
  ↓
Reviewer Agent
  ↓
Reviewer Runtime
```

After changes are merged, the integrated result must be verified again where required.

---

# 77. Runtime Recovery Example

Example:

```text
Task
 ↓
Runtime starts
 ↓
Forge crashes
 ↓
Execution record remains
 ↓
Forge restarts
 ↓
Inspect execution
 ↓
Inspect process
 ↓
Inspect workspace
 ↓
Validate checkpoint
 ↓
Choose:
resume / retry / rollback / escalate
```

The recovery decision must not assume that the previous execution is safe to resume merely because a checkpoint exists.

---

# 78. Runtime Engine and Verification

Runtime completion is only an execution result.

The system must distinguish:

```text
Execution Success
```

from:

```text
Verification Success
```

For example:

```text
Runtime:
COMPLETED

Verification:
FAILED
```

This is valid.

The agent cannot self-certify the result as verified.

---

# 79. Runtime Engine and Human Control

Human operators may control runtime executions through higher-level interfaces.

Possible actions:

```text
pause
resume
cancel
inspect
approve
reject
```

Runtime Engine provides execution-level controls where technically supported.

Human intervention remains subject to the system's approval/security/audit architecture.

---

# 80. Runtime Engine and Event System

Runtime Engine emits runtime execution facts/events.

The Event System provides the broader event infrastructure.

Runtime Engine must not become the global event broker.

---

# 81. Runtime Engine and Database

Runtime Engine requires durable execution information.

The Database specification determines storage implementation.

V0.1 uses SQLite WAL as the implementation choice already defined by the architecture.

This does not permanently constrain future deployments.

---

# 82. Runtime Engine and Distributed Execution

V0.1 is local-first.

Future architecture may introduce remote runtime workers:

```text
Runtime Engine
      ↓
Execution Worker
      ↓
Remote Runtime
```

The Runtime abstraction should allow this evolution without changing the conceptual contract.

Distributed execution is post-MVP.

---

# 83. Runtime Adapter Extensibility

Adding a new runtime should primarily require:

1. runtime adapter
2. runtime metadata
3. capability declaration
4. trust/control/observability profile
5. compatibility information
6. tests

Adding a runtime must not require rewriting the Orchestrator, Task Engine, or Agent Engine.

---

# 84. Runtime Adapter Isolation

Runtime-specific behavior must remain isolated.

A Claude-specific command-line flag must not leak into generic orchestration logic.

An OpenCode-specific invocation mode must not become a generic Task concept.

An Antigravity-specific capability must remain runtime-specific unless it represents a generic capability already supported by Forge.

---

# 85. Runtime Configuration

Runtime configuration may include:

```text
executable
arguments
working directory
environment
runtime flags
model configuration
provider configuration
timeout policy
output policy
```

Configuration must respect:

- project policy
- security policy
- ExecutionToken scope
- runtime capabilities

---

# 86. Runtime Observability Limitations

Every adapter should expose what it can actually observe.

Example:

```yaml
observability_profile:
  stdout: true
  stderr: true
  process_state: true
  internal_tool_calls: false
  internal_network_calls: false
  internal_filesystem_actions: false
```

This is especially important for L1 external runtimes.

Forge must prefer explicit limitations over false claims.

---

# 87. Runtime Control Limitations

Likewise:

```yaml
control_profile:
  process_start: true
  process_cancel: true
  workspace: true
  internal_tools: false
  internal_network: false
  internal_filesystem: false
```

The exact values are runtime-specific.

---

# 88. Runtime Security Profile

Example conceptual metadata:

```yaml
security_profile:
  process_isolation:
  filesystem_boundary:
  network_boundary:
  credential_scope:
  sandbox:
  host_access:
```

This metadata describes actual properties.

It does not grant authorization.

---

# 89. Runtime Capability Resolution Example

Suppose a Task requires:

```text
filesystem_write
git
non_interactive
```

Candidate runtime provides:

```text
filesystem_access
git_access
non_interactive
```

Capability Resolver combines:

```text
Task requirements
Agent permissions
Skill requirements
Runtime capabilities
Project policy
Security policy
```

Result:

```text
ALLOWED
```

The Runtime Engine then validates the ExecutionToken and executes.

---

# 90. Capability Denial Example

Suppose:

```text
Task requires:
network_access
```

Runtime capability:

```text
network_access = unsupported
```

Capability Resolver returns:

```text
DENIED
```

Runtime Engine must not attempt execution.

---

# 91. Approval Required Example

Suppose:

```text
Task requests
production deployment
```

Project policy requires human approval.

Capability resolution returns:

```text
APPROVAL REQUIRED
```

Runtime Engine must not launch until the required approval state is satisfied.

Approval authority remains outside Runtime Engine.

---

# 92. Runtime Fallback Example

Preferred runtime:

```text
L1 External Runtime
```

Fallback:

```text
L4 Native Runtime
```

If the fallback changes capability/security characteristics, the system must re-evaluate capability and policy requirements.

Fallback is not a blind retry with a different executable.

---

# 93. Runtime Failure Example

```text
Runtime:
START_FAILURE
```

Runtime Engine reports:

```yaml
runtime_result:
  status: FAILED
  error:
    category: START_FAILURE
```

Task Engine may then determine:

```text
retry
fallback
pause
replan
fail
```

Runtime Engine does not make that Task-level decision.

---

# 94. Runtime Timeout Example

```text
Runtime
 ↓
RUNNING
 ↓
Execution Timeout
 ↓
Cancellation
 ↓
Grace Period
 ↓
Forced Termination
 ↓
TIMED_OUT
```

The resulting Task state is determined by Task/Orchestration policy.

---

# 95. Runtime Crash Example

```text
Runtime
 ↓
RUNNING
 ↓
Process exits unexpectedly
 ↓
CRASHED
 ↓
Runtime Result
 ↓
Task Engine / Orchestrator
 ↓
Retry / Fallback / Replan / Escalate
```

---

# 96. Runtime Engine Architectural Invariants

### Invariant 001 — Execution Ownership

Runtime Engine owns runtime execution lifecycle.

### Invariant 002 — Task State Separation

Runtime Engine never becomes authoritative for Task state.

### Invariant 003 — Authorization Before Execution

Forge-controlled execution requires valid capability authorization.

### Invariant 004 — Token Boundary

ExecutionToken authorizes the Forge execution boundary and does not guarantee control over opaque runtime internals.

### Invariant 005 — Concept Separation

Runtime, Agent, Task, Model, Provider, Tool, Capability, Permission, Trust, and Verification remain distinct concepts.

### Invariant 006 — Trust Separation

Trust Class is not permission.

### Invariant 007 — Adapter Isolation

Runtime-specific invocation logic remains inside adapters.

### Invariant 008 — Honest Governance

Opaque external runtimes must not be represented as fully governed when they are not.

### Invariant 009 — Workspace Safety

Concurrent writers use isolated workspaces according to the locked workspace policy.

### Invariant 010 — Crash Integrity

Crash integrity precedes automatic resumption.

### Invariant 011 — Result Is Not Verification

Runtime completion does not constitute verification success.

### Invariant 012 — Extensibility

Adding a runtime must not require rewriting the core orchestration/task architecture.

### Invariant 013 — Security Boundary

Runtime Engine cannot override Security Policy.

### Invariant 014 — Capability Boundary

Runtime Engine cannot grant capabilities that Capability Resolver did not authorize.

### Invariant 015 — Task Mutation Boundary

Runtime execution results are evidence for Task Engine; Runtime Engine does not directly mutate Task state.

---

# 97. Dependency Map

```text
07 Runtime Engine
│
├── depends on
│   ├── 03 Agent System
│   ├── 05 Orchestration Engine
│   ├── 06 Task Engine
│   ├── 06.5 Architectural Decisions
│   ├── Capability Resolver
│   ├── Workspace Manager
│   └── Security Policy
│
├── integrates with
│   ├── 08 Runtime Discovery
│   ├── 09 Provider Router
│   ├── 10 Auth & Connections
│   ├── 11 Tool Execution
│   ├── 13 Event System
│   └── Verification Engine
│
└── consumed by
    ├── Orchestrator
    ├── Agent Engine
    ├── CLI
    └── Dashboard
```

---

# 98. Implementation Boundary

The Runtime Engine should contain:

```text
runtime lifecycle
runtime adapters
runtime execution
process management
runtime health
runtime output
runtime result normalization
runtime execution events
runtime execution recovery
```

It should not contain:

```text
global task state
global task scheduling
agent organization
agent lifecycle
skill definitions
provider routing
credential storage
global authorization policy
verification verdict
global event infrastructure
```

---

# 99. V0.1 Implementation Guidance

The V0.1 implementation should favor a simple local-first modular architecture.

Target:

```text
Node.js
Modular Monolith
SQLite WAL
CLI
Dashboard
Local Runtime Execution
Runtime Adapters
Durable Execution Records
Git Worktree Isolation
```

Avoid introducing:

- microservices
- distributed queues
- Kubernetes
- event sourcing
- runtime marketplace infrastructure
- unnecessary remote workers

into V0.1.

---

# 100. Post-MVP Extensions

Potential future extensions include:

- remote runtime workers
- distributed execution
- containerized runtime execution
- stronger sandboxing
- runtime pools
- advanced runtime scheduling
- additional coding CLIs
- remote execution
- richer checkpointing
- runtime marketplace

These are post-MVP capabilities.

---

# 101. Non-Goals

Runtime Engine V0.1 is not:

- a task scheduler
- an organization manager
- an agent manager
- a provider router
- a model router
- a skill engine
- a verification engine
- a universal sandbox
- a complete security policy engine
- a replacement for external AI runtimes
- a guarantee of complete control over opaque external CLIs
- a distributed execution platform

---

# 102. Final Runtime Model

The complete execution relationship is:

```text
Human Intent
      ↓
Orchestrator
      ↓
Task Engine
      ↓
Agent
      ↓
Runtime Strategy
      ↓
Capability Resolver
      ↓
ExecutionToken
      ↓
Runtime Engine
      ↓
Runtime Adapter
      ↓
Runtime
      ↓
Workspace
      ↓
Runtime Result
      ↓
Verification Engine
      ↓
Task Engine
```

Authority boundaries:

```text
Human
→ defines intent and retains human sovereignty

Orchestrator
→ plans, coordinates, schedules, and assigns

Task Engine
→ owns Task definition, DAG, leases, and Task state

Organization Manager
→ owns team formation and organization structure

Agent Engine
→ owns Agent identity and lifecycle

Skill Engine
→ owns procedural skills

Capability Resolver
→ determines ALLOWED / DENIED / APPROVAL REQUIRED

Security Policy Authority
→ owns security policy

Runtime Engine
→ manages runtime execution

Runtime Adapter
→ translates generic execution into runtime-specific invocation

Provider Router
→ resolves model/provider routing

Tool Execution Engine
→ executes Forge-mediated tools

Verification Engine
→ determines deterministic verification outcome

Reviewer Agent
→ provides semantic review where required

Human Operator
→ retains approval and intervention authority
```

---

# 103. Final Principle

> **Agent defines responsibility.**
>
> **Runtime provides execution.**
>
> **Adapter translates Forge execution contracts into runtime-specific invocation.**
>
> **Capability Resolver determines what is allowed.**
>
> **Task Engine owns task state.**
>
> **Orchestrator coordinates work.**
>
> **Verification determines whether the resulting work is acceptable.**

Forge Wanzz does not need to reinvent every AI coding runtime.

Forge provides the execution control plane that makes different runtimes usable as interchangeable execution capabilities while preserving explicit authority, security, observability, and verification boundaries.

The Runtime Engine exists to make execution replaceable without making the rest of Forge dependent on the internal implementation of any single runtime.
