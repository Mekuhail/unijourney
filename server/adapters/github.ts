/**
 * GitHub public-profile adapter (real). Reads only public data through the REST API: no OAuth, no stored tokens.
 * Unauthenticated calls are limited to 60 requests/hour per IP, so callers cache the summary in the database and
 * refresh it on demand. Set GITHUB_TOKEN to raise the limit for a shared deployment.
 * Docs: https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user
 */
export interface GithubRepo { name: string; description: string | null; url: string; language: string | null; stars: number; topics: string[]; pushed_at: string; fork: boolean }
export interface GithubSummary { username: string; name: string | null; profile_url: string; avatar_url: string | null; public_repos: number; repos: GithubRepo[]; languages: Array<{ name: string; repos: number }>; fetched_at: string }

const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function isGithubUsername(s: string): boolean {
  return USERNAME.test(s);
}

/** Accepts "sara-dev", "@sara-dev" or "https://github.com/sara-dev" and returns the username, or null. */
export function parseGithubUsername(input: string): string | null {
  const s = input.trim().replace(/^@/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)/i);
  const u = m ? m[1] : s;
  return isGithubUsername(u) ? u : null;
}

async function gh<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'UniJourney-demo', 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetchImpl(`https://api.github.com${path}`, { headers, signal: ctrl.signal });
    if (r.status === 404) throw Object.assign(new Error('GitHub user not found'), { code: 'not_found' });
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('GitHub rate limit reached. Try again later.'), { code: 'rate_limited' });
    if (!r.ok) throw Object.assign(new Error(`GitHub returned ${r.status}`), { code: 'upstream' });
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches the public profile and the 30 most recently pushed repositories (forks excluded from the summary). */
export async function fetchGithubSummary(username: string, fetchImpl: typeof fetch = fetch): Promise<GithubSummary> {
  if (!isGithubUsername(username)) throw Object.assign(new Error('Not a valid GitHub username'), { code: 'invalid' });
  const user = await gh<{ login: string; name: string | null; html_url: string; avatar_url: string; public_repos: number }>(`/users/${encodeURIComponent(username)}`, fetchImpl);
  const raw = await gh<Array<{ name: string; description: string | null; html_url: string; language: string | null; stargazers_count: number; topics?: string[]; pushed_at: string; fork: boolean }>>(`/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=30&type=owner`, fetchImpl);
  const repos: GithubRepo[] = raw.map((r) => ({ name: r.name, description: r.description, url: r.html_url, language: r.language, stars: r.stargazers_count, topics: r.topics ?? [], pushed_at: r.pushed_at, fork: r.fork }));
  const own = repos.filter((r) => !r.fork);
  const counts = new Map<string, number>();
  for (const r of own) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const languages = [...counts.entries()].map(([name, n]) => ({ name, repos: n })).sort((a, b) => b.repos - a.repos);
  return { username: user.login, name: user.name, profile_url: user.html_url, avatar_url: user.avatar_url, public_repos: user.public_repos, repos: own.slice(0, 12), languages, fetched_at: new Date().toISOString() };
}
