import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = resolve(projectRoot, 'src/data/course-resources.json');
const owner = process.env.COURSE_RESOURCE_OWNER || 'kanzaler123';
const repository = process.env.COURSE_RESOURCE_REPO || 'fdu-course-resources';
const branch = process.env.COURSE_RESOURCE_BRANCH || 'main';
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kanzaler-course-library-build',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const courseNames = {
  'some paper': 'Papers',
  '中外建筑': 'Chinese & Foreign Architecture',
  '人工智能的软件基础': 'Software Foundations of AI',
  '人机交互': 'Human–Computer Interaction',
  '会计': 'Accounting',
  '国际经济学': 'International Economics',
  '宏观经济学': 'Macroeconomics',
  '政治经济学': 'Political Economy',
  '数据库': 'Databases',
  '数据结构': 'Data Structures',
  '殖民帝国史': 'History of Colonial Empires',
  '线性代数': 'Linear Algebra',
  '经济史': 'Economic History',
  '计算机系统基础': 'Computer Systems',
  '高等数学': 'Advanced Mathematics',
};

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function formatFile(blob) {
  const parts = blob.path.split('/');
  const course = parts.shift();
  const name = parts.at(-1);
  const category = parts.length > 1 ? parts[0] : 'General';
  const extension = name.includes('.') ? name.split('.').at(-1).toUpperCase() : 'FILE';
  const encodedPath = encodePath(blob.path);
  return {
    name,
    path: blob.path,
    category,
    extension,
    size: blob.size || 0,
    downloadUrl: `https://github.com/${owner}/${repository}/raw/refs/heads/${branch}/${encodedPath}`,
    viewUrl: `https://github.com/${owner}/${repository}/blob/${branch}/${encodedPath}`,
    course,
  };
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
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
  const [repo, tree] = await Promise.all([
    github(`/repos/${owner}/${repository}`),
    github(`/repos/${owner}/${repository}/git/trees/${branch}?recursive=1`),
  ]);
  if (tree.truncated) throw new Error('GitHub returned a truncated repository tree.');

  const grouped = new Map();
  for (const blob of tree.tree.filter((entry) => entry.type === 'blob')) {
    const [topLevel] = blob.path.split('/');
    if (!blob.path.includes('/') || topLevel.startsWith('.')) continue;
    const file = formatFile(blob);
    const files = grouped.get(file.course) || [];
    files.push(file);
    grouped.set(file.course, files);
  }

  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  const courses = [...grouped.entries()]
    .map(([nameZh, files]) => {
      const categories = new Map();
      files.sort((left, right) => collator.compare(left.path, right.path));
      for (const { course: _course, ...file } of files) {
        const categoryFiles = categories.get(file.category) || [];
        categoryFiles.push(file);
        categories.set(file.category, categoryFiles);
      }
      return {
        id: encodeURIComponent(nameZh).replaceAll('%', '').toLowerCase(),
        name: { en: courseNames[nameZh] || nameZh, zhCN: nameZh === 'some paper' ? '论文资料' : nameZh },
        fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.size, 0),
        categories: [...categories.entries()].map(([name, categoryFiles]) => ({ name, files: categoryFiles })),
      };
    })
    .sort((left, right) => collator.compare(left.name.zhCN, right.name.zhCN));

  const snapshot = {
    repository: {
      owner,
      name: repository,
      branch,
      htmlUrl: repo.html_url,
      updatedAt: repo.updated_at,
    },
    courses,
    totals: {
      courses: courses.length,
      files: courses.reduce((sum, course) => sum + course.fileCount, 0),
      bytes: courses.reduce((sum, course) => sum + course.totalBytes, 0),
    },
    generatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Synced ${snapshot.totals.files} files across ${snapshot.totals.courses} courses.`);
} catch (error) {
  const fallback = await readFallback();
  if (!fallback) throw error;
  console.warn(`Course resource sync failed; keeping the checked-in snapshot. ${error.message}`);
}
