import test from 'node:test';
import assert from 'node:assert/strict';
import { WeondClient, normalizeApiBase, scrubSecrets } from '../src/client.mjs';
import { TOOLS, handleJsonRpcMessage } from '../src/server.mjs';

test('normalizeApiBase enforces https for remote hosts and allows localhost http', () => {
  assert.equal(normalizeApiBase('https://api.weond.com/'), 'https://api.weond.com');
  assert.equal(normalizeApiBase('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000');
  assert.throws(() => normalizeApiBase('http://api.weond.com'), /https/);
});

test('scrubSecrets redacts PAT and provider tokens', () => {
  const scrubbed = scrubSecrets('Auth failed for weond_pat_abc123456 and Bearer secretToken999');
  assert.ok(!scrubbed.includes('weond_pat_abc123456'));
  assert.ok(!scrubbed.includes('secretToken999'));
});

test('MCP initialize and tools/list return expected protocol and 11 tools', async () => {
  const client = new WeondClient({ apiUrl: 'http://127.0.0.1:3000', token: 'weond_pat_test' });

  const init = await handleJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, client);
  assert.equal(init.result.serverInfo.name, '@weond/mcp-server');

  const listed = await handleJsonRpcMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, client);
  assert.equal(listed.result.tools.length, TOOLS.length);
  assert.ok(listed.result.tools.some((t) => t.name === 'weond_bind_plugin'));
});

test('MCP tools/call executes against mocked Weond API and returns structured JSON', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, method: opts.method, auth: opts.headers.Authorization, body: opts.body });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          data: {
            workspaces: [{ id: 'ws_1', name: 'Acme', slug: 'acme', role: 'owner' }],
          },
        }),
    };
  };

  const client = new WeondClient({
    apiUrl: 'https://api.weond.com',
    token: 'weond_pat_demo',
    fetchImpl: mockFetch,
  });

  const res = await handleJsonRpcMessage(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'weond_list_workspaces', arguments: {} },
    },
    client
  );

  assert.equal(res.result.isError, undefined);
  const parsed = JSON.parse(res.result.content[0].text);
  assert.equal(parsed[0].slug, 'acme');
  assert.equal(calls[0].url, 'https://api.weond.com/req');
  assert.equal(calls[0].auth, 'Bearer weond_pat_demo');
});

test('MCP tools/call returns isError when WEOND_API_TOKEN is missing', async () => {
  const client = new WeondClient({ apiUrl: 'https://api.weond.com', token: '' });
  const res = await handleJsonRpcMessage(
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'weond_whoami', arguments: {} },
    },
    client
  );
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /WEOND_API_TOKEN/);
});
