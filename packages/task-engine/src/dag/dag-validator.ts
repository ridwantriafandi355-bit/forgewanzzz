export interface DagNode {
  id: string;
  dependencies: string[];
}

export interface DagValidationResult {
  valid: boolean;
  cycle?: string[];
  topologicalOrder?: string[];
}

export class DagValidator {
  static validateAcyclic(nodes: DagNode[]): DagValidationResult {
    const nodeMap = new Map<string, DagNode>();
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const node of nodes) {
      nodeMap.set(node.id, node);
      inDegree.set(node.id, 0);
      adj.set(node.id, []);
    }

    for (const node of nodes) {
      for (const depId of node.dependencies) {
        if (!nodeMap.has(depId)) {
          return { valid: false, cycle: [node.id, depId] };
        }
        adj.get(depId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
      }
    }

    // Kahn's Algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      for (const v of adj.get(u) || []) {
        const newDeg = inDegree.get(v)! - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
        }
      }
    }

    if (order.length !== nodes.length) {
      const unresolved = nodes.filter(n => (inDegree.get(n.id) || 0) > 0).map(n => n.id);
      return { valid: false, cycle: unresolved };
    }

    return { valid: true, topologicalOrder: order };
  }
}
