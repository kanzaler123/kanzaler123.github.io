import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = resolve(projectRoot, 'src/data/github-snapshot.json');
const owner = process.env.GITHUB_OWNER || 'kanzaler123';
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kanzaler-starfield-build',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function readFallback() {
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch {
    return null;
  }
}

try {
  const [user, repositories] = await Promise.all([
    github(`/users/${owner}`),
    github(`/users/${owner}/repos?per_page=100&sort=updated&type=public`),
  ]);

  const snapshot = {
    user: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
      bio: user.bio,
      publicRepos: user.public_repos,
      followers: user.followers,
    },
    repositories: repositories.map((repo) => ({
      name: repo.name,
      htmlUrl: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      updatedAt: repo.updated_at,
      archived: repo.archived,
      fork: repo.fork,
    })),
    generatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Synced ${snapshot.repositories.length} public repositories for ${owner}.`);
} catch (error) {
  const fallback = await readFallback();
  if (!fallback) throw error;
  console.warn(`GitHub sync failed; keeping the checked-in snapshot. ${error.message}`);
}
