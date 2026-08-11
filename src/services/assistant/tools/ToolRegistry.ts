import { AssistantTool, Capability } from '../types';

// The Orchestrator only ever knows a capability name — never which retrievers back it.
// See docs/ai-research-assistant-architecture.md §07.
export class ToolRegistry {
  private static tools = new Map<Capability, AssistantTool>();

  static register(tool: AssistantTool): void {
    ToolRegistry.tools.set(tool.capability, tool);
  }

  static get(capability: Capability): AssistantTool {
    const tool = ToolRegistry.tools.get(capability);
    if (!tool) throw new Error(`No tool registered for capability: ${capability}`);
    return tool;
  }

  static has(capability: Capability): boolean {
    return ToolRegistry.tools.has(capability);
  }
}
