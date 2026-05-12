export interface LinearMockAttentionItem {
  readonly provider: "linear";
  readonly workspace: string;
  readonly team: string;
  readonly project: string;
  readonly issue_id: string;
  readonly title: string;
  readonly status: "Backlog" | "In Progress" | "In Review" | "Done";
  readonly assignee: string;
}

export async function fetchLinearMockAttention(): Promise<LinearMockAttentionItem[]> {
  return [
    {
      provider: "linear",
      workspace: "acme-eng",
      team: "platform",
      project: "Developer Control Plane",
      issue_id: "PLAT-17",
      title: "Review release rollback evidence before next publish",
      status: "In Progress",
      assignee: "rachel",
    },
    {
      provider: "linear",
      workspace: "acme-eng",
      team: "platform",
      project: "Developer Control Plane",
      issue_id: "PLAT-24",
      title: "Validate provider capability matrix for GitHub and Linear",
      status: "In Review",
      assignee: "olivia",
    },
  ];
}
