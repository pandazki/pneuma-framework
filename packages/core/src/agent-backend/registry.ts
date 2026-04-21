import type {
  AgentBackendDescriptor,
  AgentBackendFactory,
  AgentBackendType,
  BackendAvailability,
} from "./types.js";

interface RegistryEntry {
  descriptor: AgentBackendDescriptor;
  factory: AgentBackendFactory;
}

const registry = new Map<AgentBackendType, RegistryEntry>();
const order: AgentBackendType[] = [];

export function registerAgentBackend(
  descriptor: AgentBackendDescriptor,
  factory: AgentBackendFactory,
): void {
  if (!registry.has(descriptor.type)) order.push(descriptor.type);
  registry.set(descriptor.type, { descriptor, factory });
}

export function getAgentBackendDescriptor(type: AgentBackendType): AgentBackendDescriptor | undefined {
  return registry.get(type)?.descriptor;
}

export function getAgentBackendFactory(type: AgentBackendType): AgentBackendFactory | undefined {
  return registry.get(type)?.factory;
}

export function listAgentBackends(): AgentBackendDescriptor[] {
  return order
    .map((t) => registry.get(t)?.descriptor)
    .filter((d): d is AgentBackendDescriptor => d !== undefined);
}

export interface DetectResult extends BackendAvailability {
  type: AgentBackendType;
}

export async function detectBackendAvailability(): Promise<DetectResult[]> {
  const descriptors = listAgentBackends();
  return Promise.all(
    descriptors.map(async (d) => {
      const avail = d.detect ? await d.detect() : { available: true };
      return { type: d.type, ...avail };
    }),
  );
}

export function clearAgentBackendRegistry(): void {
  registry.clear();
  order.length = 0;
}
