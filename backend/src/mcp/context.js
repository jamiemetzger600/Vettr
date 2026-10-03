import { AsyncLocalStorage } from 'node:async_hooks';

export const mcpContext = new AsyncLocalStorage();

export function currentMcp() {
  const ctx = mcpContext.getStore();
  if (!ctx?.user?.userId) {
    const err = new Error('MCP auth context missing');
    err.code = 'unauthorized';
    throw err;
  }
  return ctx;
}
