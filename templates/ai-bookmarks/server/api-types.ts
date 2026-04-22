export interface BookmarkRow {
  id: number;
  url: string;
  title: string | null;
  fetched_at: number;
}

export interface InterpretationRow {
  id: number;
  bookmark_id: number;
  lens_name: string;
  body: string;
  created_at: number;
}

export interface BookmarkWithInterpretations extends BookmarkRow {
  interpretations: InterpretationRow[];
}

export interface GraphNode {
  id: number;
  url: string;
  title: string | null;
}

export interface GraphEdge {
  source: number;
  target: number;
  weight: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
