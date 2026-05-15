export interface HostKitVersion {
  readonly package_name: "@pneuma-framework/host-kit";
  readonly contract: "creation-host-implementation-kit-v0";
}

export function createHostKitVersion(): HostKitVersion {
  return {
    package_name: "@pneuma-framework/host-kit",
    contract: "creation-host-implementation-kit-v0",
  };
}
