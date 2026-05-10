# PRD: LaunchRoom Studio

**Status:** Draft
**Purpose:** A fresh downstream project requirement for validating whether the current `pneuma-framework` developer contract is complete enough for an external Developer to build a real Creation Host from zero context.
**Audience:** The Developer who will implement this downstream project.
**Chinese version:** [launch-room-studio-prd.zh-CN.md](./launch-room-studio-prd.zh-CN.md)

**Important:** This PRD defines product requirements and acceptance criteria. It intentionally does not prescribe exact framework APIs, file names, table schemas, package layout, or code organization. The implementer should read the current `pneuma-framework` docs, code, validators, and examples, then design their own implementation.

---

## 1. Background

The core claim of `pneuma-framework` is not "a Developer can code one app." The claim is:

> A Developer can use `pneuma-framework` to build a Creation Host; a Builder can use that Creation Host to create, inspect, evolve, preview, publish, recover, share, and fork Generated Applications by talking to a Build-phase Agent.

The current framework has accepted the four-layer model:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

It has also accumulated post-RC developer contracts around BuildThread, Scaffold Project, Code Change Lane, HostExtension, credential helpers, and Build Assurance. The next useful validation is a new downstream project that starts from the current docs rather than from the historical DevBoard Studio implementation.

LaunchRoom Studio is that validation target.

## 2. Product Summary

**Product name:** LaunchRoom Studio

**One-sentence description:**

> LaunchRoom Studio is a Creation Host where a Builder creates a lightweight "launch room" application for a product or software release: a published workspace that combines a launch checklist, GitHub attention items, release notes, risk gates, decision records, and status updates for End Users.

LaunchRoom Studio itself is not the final launch-room app. It is the Builder-facing product for creating launch-room apps.

The Generated Application created by LaunchRoom Studio can be called `launch-room`.

## 3. Roles

### Developer

The person implementing LaunchRoom Studio as an independent downstream project on top of `pneuma-framework`.

The Developer is responsible for Host product choices, including UI, local storage, mock or real provider integrations, runtime process management, and the exact generated-app domain model.

### Builder

The person using LaunchRoom Studio to create and evolve a `launch-room` Generated Application.

Example Builder: Robin, a release lead preparing a feature launch.

### End User

The person opening the Published Application to understand launch status, pending work, risks, and decisions.

Example End Users: engineers, product managers, support leads, and stakeholders.

## 4. Core User Stories

### Story A: Robin creates a launch room

Robin opens LaunchRoom Studio and creates a new `launch-room` for an upcoming release.

Robin enters:

- launch name;
- target date;
- short launch goal;
- GitHub owner/repo or public repository URL;
- initial launch checklist items;
- stakeholder names or roles.

LaunchRoom Studio creates a Generated Application and starts a preview. Robin can immediately see a product-shaped launch room, not a debug-only page.

### Story B: Robin inspects the generated app

Robin switches from preview to inspection.

The Host shows:

- the generated app identity and version;
- the launch-room sections or modules;
- current launch data;
- connected provider status;
- BuildThread summary;
- recent proposals, approvals, denials, execution receipts, and assurance evidence;
- publish and rollback state.

The inspection view should help Robin understand "what changed" and "why it is safe enough to continue."

### Story C: Robin evolves the launch room by talking

Robin asks the Build-phase Agent:

> Add a Risk Gate section. It should block publish readiness until every high-risk item has an owner and mitigation note.

The system must turn this into a proposal that Robin can review before any change takes effect.

Robin should be able to deny the proposal once and see that the Generated Application remains unchanged.

Robin should then be able to approve a revised proposal and see the Risk Gate appear in preview, inspection, and evidence.

### Story D: The Host catches unsafe or incomplete changes

Robin asks:

> Remove the launch checklist and just show a big green status if the agent thinks we are ready.

This request is intentionally risky. LaunchRoom Studio should not blindly apply it.

The system should either:

- ask a clarification question;
- produce a proposal whose review packet clearly explains destructive impact;
- block the proposal because a guardrail or test fails;
- or allow Robin to deny it before mutation.

This story validates that the framework is helping control AI Build uncertainty, not just recording successful happy paths.

### Story E: Robin publishes, restarts, and rolls back

Robin publishes a version of the generated `launch-room`.

LaunchRoom Studio shows:

- current active version;
- publish health;
- last restart result;
- rollback target;
- assurance state for the version.

Robin can restart the active Published Application and roll back to the previous version or local equivalent.

This can be implemented with local process management. It does not need production cloud deployment.

### Story F: Robin shares the launch room

Robin exports or shares the launch-room artifact.

The share artifact must not include:

- source database;
- access tokens;
- refresh tokens;
- API keys;
- passwords;
- private provider caches;
- private Build Agent workspace state.

It should include enough information for another person to understand what must be rebound or reconfigured.

### Story G: Casey installs Robin's launch room

Casey receives Robin's shared artifact and installs it locally.

Casey should be required to provide their own launch metadata and provider configuration. Casey must not inherit Robin's private data or credentials.

### Story H: Dana forks Robin's launch room

Dana receives Robin's shared artifact, chooses fork instead of install, and makes product-level changes:

- remove GitHub attention;
- add a manual "customer comms" section;
- change risk readiness rules;
- publish Dana's fork as a separate local application.

The fork should preserve lineage but run independently.

## 5. MVP Scope

### 5.1 Creation Host Home

LaunchRoom Studio must provide a Builder-facing home page or equivalent UI.

It should include:

- create new launch room;
- list existing launch rooms;
- show project status;
- enter or choose a simple Builder identity;
- navigate to preview, inspect, evolve, publish, share, and fork/install flows.

Authentication can be simple. Manual `user_id` / role input is acceptable.

### 5.2 Project Creation

Builder creates a launch room by providing:

- application name;
- launch name;
- target date;
- launch goal;
- GitHub repository or mock provider source;
- initial checklist;
- initial stakeholders.

The result must be a previewable Generated Application.

### 5.3 Generated Launch Room Preview

The Generated Application should feel like a real small app.

MVP preview sections:

- Launch Overview;
- Readiness Checklist;
- GitHub Attention;
- Risk Gate;
- Decisions;
- Stakeholder Update;
- Publish Status.

The GitHub source may use public GitHub data or a mock provider. If a real provider credential is used, it must follow the no-secret sharing boundary.

### 5.4 Inspect / Debug

LaunchRoom Studio must include an inspection surface.

It should show at least:

- generated app version;
- app modules or sections;
- current launch data;
- source or definition summary;
- provider status;
- BuildThread transcript summary;
- review packets;
- assurance cases;
- recovery or rollback evidence;
- release state.

Do not expose random internal tables as the primary experience. The inspection view should be product-shaped and understandable to a Builder.

### 5.5 Builder Conversation

Builder should be able to evolve the generated launch room by talking.

The Host must preserve the conversation as a durable project artifact. A reviewer should be able to inspect:

- Builder request;
- agent clarification if any;
- proposal;
- approval or denial;
- execution receipt;
- assurance result.

### 5.6 Governed Change Path

The MVP must include one complete governed change path:

> Add a Risk Gate section that changes readiness behavior.

Minimum behavior:

- proposal before mutation;
- visible review packet;
- approval path;
- denial path;
- execution receipt;
- preview changes after approval;
- inspection/evidence changes after approval;
- no mutation after denial.

### 5.7 Unsafe Change Path

The MVP must include one negative path:

> Remove or bypass a critical launch-readiness control.

The system must not silently apply this as a normal happy-path change.

Acceptable outcomes:

- clarification required;
- proposal blocked before approval;
- approval denied;
- tests fail before proposal;
- post-apply validation fails and the system recovers or rolls back with evidence.

### 5.8 Publish / Restart / Rollback

The Host must support a local release workflow:

- publish current generated app version;
- show active published version;
- restart active version;
- roll back to previous version or local equivalent;
- show health and evidence for each step.

Production deployment is not required.

### 5.9 Share / Install / Fork

The Host must demonstrate a portable artifact boundary.

Share artifact requirements:

- no secrets;
- no source database;
- no private cache;
- clear provider or credential rebinding requirements;
- enough app definition or recipe data for install/fork.

Install requirements:

- receiver provides their own configuration;
- receiver does not inherit Robin's private data;
- receiver can run a local Published Application.

Fork requirements:

- fork records lineage;
- fork can make at least one product-level change;
- fork can preview and publish independently.

## 6. Non-Goals

MVP does not require:

- production SaaS hosting;
- real multi-tenant authentication;
- enterprise SSO;
- production IAM;
- marketplace listing;
- signed artifact provenance;
- cloud deployment;
- Docker release if local process publish is enough;
- zero-downtime rollout;
- real GitHub App installation;
- full GitHub API coverage;
- real email, Slack, Linear, or Jira integrations;
- production-grade secret persistence;
- billing, quotas, or organization management;
- full mobile optimization;
- rebuilding Pneuma 2.x.

If the implementer chooses to add any of these, they must explain why it was necessary for validation.

## 7. Data And Privacy Requirements

The MVP can use public GitHub data, deterministic fixtures, or a mock provider.

It must obey:

- no credential in share artifact;
- no source database in share artifact;
- no private derived cache in share artifact;
- provider configuration must be rebound or re-entered by installer/forker;
- any mock credential should still exercise the same boundary as a real credential;
- if public GitHub data is used, do not require private repository access.

## 8. Build Assurance Requirements

LaunchRoom Studio must make Build Assurance visible enough that an external reviewer can understand the control loop.

For at least one approved change, show:

- original Builder intent;
- risk or ambiguity classification;
- proposal summary;
- affected surfaces;
- expected data or UI impact;
- checks run before proposal;
- approval decision;
- execution result;
- checks run after execution;
- recovery or rollback evidence if applicable;
- final assurance state.

This is not a compliance audit feature. It is an engineering-control feature for Builder + Build Agent changes.

## 9. UX Requirements

The app should make the four-layer model understandable:

1. LaunchRoom Studio is the Creation Host.
2. The Builder is creating a launch-room Generated Application.
3. Preview shows the generated app under construction.
4. Publish exposes a selected Published Application version.
5. Inspect explains what changed, why, and with what evidence.

The UI does not need to be commercial-polish, but it should look and behave like a real product rather than a collection of raw debug endpoints.

## 10. Acceptance Demo

The finished downstream project should support this live walkthrough:

1. Start LaunchRoom Studio.
2. Enter Builder identity as Robin.
3. Create `launch-room`.
4. Enter launch metadata and provider or fixture source.
5. Open preview and see the initial launch room.
6. Open inspect and see app status, sections, data, transcript/evidence, and release state.
7. Ask the agent to add Risk Gate.
8. Deny the first proposal and confirm no mutation.
9. Approve a revised proposal.
10. See Risk Gate in preview.
11. See review packet, execution receipt, and assurance case in inspect.
12. Trigger the unsafe-change request and show a blocked/denied/recovered path.
13. Publish the current version.
14. Restart the active Published Application.
15. Roll back to previous version or local equivalent.
16. Export/share the launch room.
17. Install it as Casey with new local configuration.
18. Fork it as Dana, remove GitHub attention, add customer comms, and publish the fork.

## 11. Required Tests

At minimum:

- contract validation tests for Host authoring files;
- Builder conversation persistence or replay test;
- governed change approval test;
- denial/no-mutation test;
- unsafe-change blocked or recovered test;
- publish/restart/rollback smoke test;
- share artifact no-secret test;
- install/fork rebinding test;
- at least one end-to-end smoke test that starts the Host and runs the main flow.

## 12. Framework Validation Questions

After implementation, the downstream report should answer:

- Could the Developer understand the four-layer model without upstream explanation?
- Which docs were essential?
- Which docs were stale, redundant, missing, or misleading?
- Did the validator/doctor tools catch real mistakes?
- Did BuildThread reduce Host-owned conversation glue?
- Did Scaffold Project / Code Change Lane make code-change boundaries clear?
- Did HostExtension concepts fit product-level generated modules?
- Did credential utilities help without turning the framework into hosted identity?
- Did Build Assurance make approval and publish decisions clearer?
- Where did the Developer need to read framework source to understand required shapes?
- What framework helper would remove the most repeated Host code?
- Did any framework concept force a product choice that should belong to LaunchRoom Studio?
- What would block another Developer from repeating this project?

## 13. Deliverables

The downstream Developer should deliver:

- independent project repo;
- README with setup and upstream framework commit hash;
- one-command local start;
- one-command test suite;
- demo script matching the acceptance demo;
- screenshots or short recordings of key states;
- generated app example data or fixtures;
- gap log using the upstream gap template;
- short implementation report:
  - what was easy;
  - what was unclear;
  - where framework docs were enough;
  - where framework source had to be read;
  - whether any framework code had to change;
  - recommended upstream fixes.

## 14. Success Criteria

This downstream validation is successful if:

- LaunchRoom Studio runs locally;
- the main Builder flow works end to end;
- at least one approved generated-app change is governed and evidenced;
- at least one unsafe or denied path proves no accidental mutation;
- publish/restart/rollback or local equivalent works;
- share/install/fork proves no-secret portability;
- the implementer can clearly distinguish Host product choices from framework gaps;
- the final report gives upstream concrete, reproducible feedback.

It is acceptable for the project to find framework gaps. Finding precise gaps is part of the validation goal.
