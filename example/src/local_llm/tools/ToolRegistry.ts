import type { ToolDefinition, ToolCallRequest } from './types';

/**
 * Real register/list/execute mechanics; zero built-in tools registered here.
 * The app registers whatever tools make sense for it (CommandMatcher's
 * PAUSE/RESUME/etc. are natural first candidates, but wiring those in is
 * app-flow work, not part of this scaffold). Tool schemas registered here
 * flow into PromptAssembler -> the model; a returned ToolCallRequest is
 * executed via `execute`, whose result becomes a 'tool' ChatMessage fed back
 * into the next turn.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(call: ToolCallRequest): Promise<unknown> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      throw new Error(`ToolRegistry: no tool registered with name "${call.name}"`);
    }
    return tool.handler(call.arguments);
  }
}
