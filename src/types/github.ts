export interface GitHubUserSnapshot {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  publicRepos: number;
  followers: number;
}

export interface GitHubRepositorySnapshot {
  name: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  archived: boolean;
  fork: boolean;
}

export interface GitHubSnapshot {
  user: GitHubUserSnapshot;
  repositories: GitHubRepositorySnapshot[];
  generatedAt: string | null;
}
