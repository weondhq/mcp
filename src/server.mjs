import { createInterface } from 'node:readline';
import { WeondClient, scrubSecrets } from './client.mjs';

export const SERVER_INFO = {
  name: '@weond/mcp-server',
  version: '1.0.0',
};

const PROTOCOL_VERSION = '2024-11-05';

export const TOOLS = [
  {
    name: 'weond_whoami',
    description: 'Return the authenticated Weond user profile for the configured WEOND_API_TOKEN.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'weond_list_workspaces',
    description: 'List all Weond workspaces accessible to the authenticated user.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'weond_list_projects',
    description: 'List projects, recent deployments, environment variable keys, and domains in a Weond workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID from weond_list_workspaces.' },
      },
      required: ['workspaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_get_deployment_logs',
    description: 'Fetch build and runtime logs for a specific Weond deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string', description: 'Deployment UUID.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
      },
      required: ['deploymentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_queue_deployment',
    description: 'Trigger a new deployment for a Weond project on its production branch or a specified Git branch.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID.' },
        branch: { type: 'string', description: 'Optional Git branch name.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_redeploy',
    description: 'Redeploy an existing Weond deployment by deployment ID.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string', description: 'Deployment UUID to redeploy.' },
      },
      required: ['deploymentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_rollback_deployment',
    description: 'Perform an instant zero-downtime rollback of a project to a previous ready deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID.' },
        deploymentId: { type: 'string', description: 'Target previous deployment UUID.' },
      },
      required: ['projectId', 'deploymentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_set_env_var',
    description: 'Create or update an encrypted environment variable on a Weond project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID.' },
        key: { type: 'string', description: 'Environment variable name (e.g. API_URL).' },
        value: { type: 'string', description: 'Environment variable value.' },
        environments: {
          type: 'array',
          items: { type: 'string', enum: ['production', 'preview', 'development'] },
          default: ['production', 'preview', 'development'],
        },
      },
      required: ['projectId', 'key', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_delete_env_var',
    description: 'Delete an environment variable key from selected environments on a Weond project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID.' },
        key: { type: 'string', description: 'Environment variable name to delete.' },
        environments: {
          type: 'array',
          items: { type: 'string', enum: ['production', 'preview', 'development'] },
          default: ['production', 'preview', 'development'],
        },
      },
      required: ['projectId', 'key'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_list_plugins',
    description: 'List available workspace plugins (Supabase, Upstash Redis, Resend, Sentry), active connections, and project bindings.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID.' },
      },
      required: ['workspaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'weond_bind_plugin',
    description: 'Link a connected workspace plugin resource to one or multiple Weond projects and inject encrypted environment variables.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID.' },
        provider: {
          type: 'string',
          enum: ['supabase', 'upstash-redis', 'resend', 'sentry'],
          description: 'Connected plugin provider ID.',
        },
        resourceId: { type: 'string', description: 'External resource ID (project ref, Redis DB ID, domain, or org/project).' },
        resourceName: { type: 'string', description: 'Human-readable resource name.' },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'One or more target Weond project UUIDs.',
        },
        environments: {
          type: 'array',
          items: { type: 'string', enum: ['production', 'preview', 'development'] },
          default: ['production', 'preview'],
        },
        autoFrameworkPrefix: { type: 'boolean', default: true },
        namespace: { type: 'string', description: 'Optional server namespace prefix (e.g. ANALYTICS_) for multi-resource bindings.' },
      },
      required: ['workspaceId', 'provider', 'resourceId', 'projectIds'],
      additionalProperties: false,
    },
  },
];

export async function executeTool(client, name, args = {}) {
  switch (name) {
    case 'weond_whoami':
      return client.whoami();
    case 'weond_list_workspaces':
      return client.listWorkspaces();
    case 'weond_list_projects':
      return client.listProjects(args.workspaceId);
    case 'weond_get_deployment_logs':
      return client.getDeploymentLogs(args.deploymentId, args.limit);
    case 'weond_queue_deployment':
      return client.queueDeployment(args.projectId, args.branch);
    case 'weond_redeploy':
      return client.redeployDeployment(args.deploymentId);
    case 'weond_rollback_deployment':
      return client.rollbackDeployment(args.projectId, args.deploymentId);
    case 'weond_set_env_var':
      return client.setEnvVar(args.projectId, args.key, args.value, args.environments);
    case 'weond_delete_env_var':
      return client.deleteEnvVar(args.projectId, args.key, args.environments);
    case 'weond_list_plugins':
      return client.listPlugins(args.workspaceId);
    case 'weond_bind_plugin':
      return client.bindPlugin(args.provider, {
        workspaceId: args.workspaceId,
        projectIds: args.projectIds,
        resourceId: args.resourceId,
        resourceName: args.resourceName || args.resourceId,
        environments: args.environments || ['production', 'preview'],
        autoFrameworkPrefix: args.autoFrameworkPrefix ?? true,
        ...(args.namespace ? { extra: { namespace: args.namespace } } : {}),
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function handleJsonRpcMessage(message, client) {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
    };
  }

  const { id, method, params } = message;

  // Notifications carry no id and expect no response.
  if (id === undefined || id === null) {
    return null;
  }

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        };
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};
        if (!toolName || !TOOLS.some((t) => t.name === toolName)) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool "${toolName}"` },
          };
        }
        try {
          const data = await executeTool(client, toolName, toolArgs);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            },
          };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: scrubSecrets(err?.message || String(err)) }],
            },
          };
        }
      }
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: scrubSecrets(err?.message || 'Internal error') },
    };
  }
}

export function startStdioServer(client = new WeondClient()) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        })}\n`
      );
      return;
    }
    const response = await handleJsonRpcMessage(parsed, client);
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
  return rl;
}
