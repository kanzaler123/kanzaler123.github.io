export interface CourseResourceFile {
  name: string;
  path: string;
  category: string;
  extension: string;
  size: number;
  downloadUrl: string;
  viewUrl: string;
}

export interface CourseResourceCategory {
  name: string;
  files: CourseResourceFile[];
}

export interface CourseResourceCourse {
  id: string;
  name: { en: string; zhCN: string };
  fileCount: number;
  totalBytes: number;
  categories: CourseResourceCategory[];
}

export interface CourseResourceSnapshot {
  repository: {
    owner: string;
    name: string;
    branch: string;
    htmlUrl: string;
    updatedAt: string;
  };
  courses: CourseResourceCourse[];
  totals: { courses: number; files: number; bytes: number };
  generatedAt: string;
}
