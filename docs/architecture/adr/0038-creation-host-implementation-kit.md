# Creation Host Implementation Kit Package Boundary

Status: Accepted

`pneuma-framework` needs reusable implementation support for Developers building Creation Hosts, but those helpers should not keep expanding `@pneuma-framework/core`. We will introduce `@pneuma-framework/host-kit` as the Host-facing package for composing BuildThread, AgentBackend, Code Change Lane, approval, assurance, runtime/data receipts, preview, and publish lifecycle into executable Creation Host loops.

`@pneuma-framework/core` remains the package for primitives, contracts, validators, stores, and evidence value objects. `@pneuma-framework/host-kit` may provide orchestration functions, explicit adapter interfaces, local/reference adapters, and a thin happy-path facade, but it must not own Host product UX, real provider SDK implementations, hosted identity, deployment control planes, or business domain models.

This boundary keeps the framework from collapsing into a specific Creation Host product while still making the framework practically usable. The long-lived Reference Host should consume `@pneuma-framework/host-kit` as a canonical example, not become the package boundary itself.
