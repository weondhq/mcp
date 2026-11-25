const DEFAULT_API_URL = 'https://api.weond.com';
const TOKEN_SCRUB_RE =
  /(weond_pat_[a-zA-Z0-9_-]+|bearer\s+[a-zA-Z0-9._~+/=-]+|sbp_[a-zA-Z0-9_]+|re_[a-zA-Z0-9_]+|sntrys_[a-zA-Z0-9_]+)/gi;

export function scrubSecrets(text) {
  return String(text ?? '').replace(TOKEN_SCRUB_RE, '[redacted]');
}

export function normalizeApiBase(rawUrl) {
  const value = String(rawUrl || DEFAULT_API_URL).trim().replace(/\/+$/, '');
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new Error('WEOND_API_URL must use https:// (http:// is only allowed for localhost).');
  }
  return value;
}

export class WeondClient {
  constructor({ apiUrl = process.env.WEOND_API_URL || DEFAULT_API_URL, token = process.env.WEOND_API_TOKEN || '', fetchImpl = fetch } = {}) {
    this.apiUrl = normalizeApiBase(apiUrl);
    this.token = String(token || '').trim();
    this.fetch = fetchImpl;
  }

  requireToken() {
    if (!this.token) {
      throw new Error(
        'WEOND_API_TOKEN is not set. Create a Personal Access Token in Weond Settings → Access Tokens and pass it via WEOND_API_TOKEN.'
      );
    }
    return this.token;
  }

  async request(path, { method = 'GET', body, timeoutMs = 20000 } = {}) {
    const token = this.requireToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'weond-mcp-server/1.0.0',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const raw = await res.text();
      let parsed = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }

      if (!res.ok) {
        const msg =
          parsed?.error?.message ||
          parsed?.errors?.[0]?.message ||
          parsed?.message ||
          res.statusText ||
          `HTTP ${res.status}`;
        throw new Error(`Weond API error (${res.status}): ${scrubSecrets(msg)}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  async graphql(query, variables = {}, operationName) {
    const payload = await this.request('/req', {
      method: 'POST',
      body: { query, variables, ...(operationName ? { operationName } : {}) },
    });
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(`Weond GraphQL error: ${scrubSecrets(payload.errors[0].message || 'Request failed')}`);
    }
    return payload?.data;
  }

  whoami() {
    return this.request('/req/auth/me');
  }

  async listWorkspaces() {
    const data = await this.graphql(
      `query Workspaces {
        workspaces { id publicId name slug role projectCount maxProjects maxConcurrentBuilds createdAt updatedAt }
      }`,
      {},
      'Workspaces'
    );
    return data?.workspaces ?? [];
  }

  async listProjects(workspaceId) {
    const data = await this.graphql(
      `query WorkspaceCatalog($workspaceId: UUID!) {
        catalog(workspaceId: $workspaceId, deploymentLimit: 5) {
          projects {
            id name slug gitProvider repoFullName productionBranch runtime
            primaryHost customHost activeDeploymentId createdAt updatedAt
            deployments { id status gitRef environment previewHost commitSha commitMessage createdAt finishedAt error }
            env { id key environments }
          }
          domains { id projectId hostname environment status sslStatus }
        }
      }`,
      { workspaceId },
      'WorkspaceCatalog'
    );
    return data?.catalog ?? { projects: [], domains: [] };
  }

  async getDeploymentLogs(deploymentId, limit = 200) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
    const data = await this.graphql(
      `query DeploymentLogs($deploymentId: UUID!, $limit: Int) {
        deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
          logs { id stream message createdAt }
        }
      }`,
      { deploymentId, limit: safeLimit },
      'DeploymentLogs'
    );
    return data?.deploymentLogs?.logs ?? [];
  }

  async queueDeployment(projectId, branch) {
    const data = await this.graphql(
      `mutation QueueDeployment($projectId: UUID!, $branch: String) {
        queueDeployment(projectId: $projectId, branch: $branch) { id }
      }`,
      { projectId, ...(branch ? { branch } : {}) },
      'QueueDeployment'
    );
    return data?.queueDeployment;
  }

  async redeployDeployment(deploymentId) {
    const data = await this.graphql(
      `mutation RedeployDeployment($id: UUID!) {
        redeployDeployment(id: $id) { id }
      }`,
      { id: deploymentId },
      'RedeployDeployment'
    );
    return data?.redeployDeployment;
  }

  async rollbackDeployment(projectId, deploymentId) {
    const data = await this.graphql(
      `mutation RollbackDeployment($projectId: UUID!, $deploymentId: UUID!) {
        rollbackDeployment(projectId: $projectId, deploymentId: $deploymentId) { activeDeploymentId }
      }`,
      { projectId, deploymentId },
      'RollbackDeployment'
    );
    return data?.rollbackDeployment;
  }

  async setEnvVar(projectId, key, value, environments = ['production', 'preview', 'development']) {
    const data = await this.graphql(
      `mutation SetEnvVar($projectId: UUID!, $key: String!, $value: String!, $environments: [String!]!) {
        setEnvVar(projectId: $projectId, key: $key, value: $value, environments: $environments) { key environments }
      }`,
      { projectId, key, value, environments },
      'SetEnvVar'
    );
    return data?.setEnvVar;
  }

  async deleteEnvVar(projectId, key, environments = ['production', 'preview', 'development']) {
    const data = await this.graphql(
      `mutation DeleteEnvVar($projectId: UUID!, $key: String!, $environments: [String!]!) {
        deleteEnvVar(projectId: $projectId, key: $key, environments: $environments) { deleted }
      }`,
      { projectId, key, environments },
      'DeleteEnvVar'
    );
    return data?.deleteEnvVar;
  }

  listPlugins(workspaceId) {
    const qs = new URLSearchParams({ workspaceId });
    return this.request(`/api/plugins/catalog?${qs.toString()}`);
  }

  listPluginResources(provider, workspaceId) {
    const qs = new URLSearchParams({ workspaceId });
    return this.request(`/api/plugins/${encodeURIComponent(provider)}/resources?${qs.toString()}`);
  }

  bindPlugin(provider, payload) {
    return this.request(`/api/plugins/${encodeURIComponent(provider)}/bind`, {
      method: 'POST',
      body: payload,
    });
  }
}
