#!/usr/bin/env node

const [, , operation = 'operate', target = 'CloudBase resource', action = '', mode = ''] = process.argv;

const details = {
  deploy: {
    tool: 'manageFunctions',
    action: target === 'all-functions' ? 'updateFunctionCode/createFunction for each function' : `updateFunctionCode/createFunction for ${target}`
  },
  invoke: {
    tool: 'manageFunctions',
    action: `invokeFunction ${target}${action ? ` action=${action}` : ''}${mode ? ` settlement_mode=${mode}` : ''}`
  }
};

const hint = details[operation] || {
  tool: 'CloudBase MCP',
  action: `${operation} ${target}`
};

console.error('[CloudBase] This project forbids tcb/CloudBase CLI operations.');
console.error(`[CloudBase] Use MCP tool ${hint.tool} with ${hint.action}.`);
console.error('[CloudBase] Confirm auth first with auth(action="status") and bind env cloud1-5glojms9a83c3457 if needed.');
process.exit(1);
