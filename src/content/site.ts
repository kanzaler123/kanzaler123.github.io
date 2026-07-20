export type Locale = 'en' | 'zh-CN';

export interface LocalizedText {
  en: string;
  zhCN: string;
}

export interface SocialLink {
  id: string;
  label: string;
  href: string;
}

export interface FeaturedProject {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  category: LocalizedText;
  repo?: string;
  href?: string;
  tags: string[];
  placeholder: boolean;
  imagePosition: string;
}

export interface MusicSettings {
  src: string;
  title: LocalizedText;
  artist: string;
  defaultVolume: number;
}

export interface SiteContent {
  name: string;
  eyebrow: LocalizedText;
  tagline: LocalizedText;
  about: LocalizedText;
  navigation: Array<{ id: string; label: LocalizedText }>;
  socialLinks: SocialLink[];
  featuredProjects: FeaturedProject[];
  music: MusicSettings;
}

export const siteContent: SiteContent = {
  name: 'Kanzaler',
  eyebrow: {
    en: 'A quiet corner of the digital sky',
    zhCN: '数字星空下的一处安静角落',
  },
  tagline: {
    en: 'A personal space for AI, learning, and imagination.',
    zhCN: '一个关于 AI、学习与想象的个人空间。',
  },
  about: {
    en: 'Curious about intelligence, moved by stories, and always learning.',
    zhCN: '对智能保持好奇，被故事打动，也始终保持学习。',
  },
  navigation: [
    { id: 'home', label: { en: 'Home', zhCN: '首页' } },
    { id: 'projects', label: { en: 'Projects', zhCN: '项目' } },
    { id: 'notes', label: { en: 'Notes', zhCN: '笔记' } },
    { id: 'about', label: { en: 'About', zhCN: '关于' } },
  ],
  socialLinks: [
    {
      id: 'github',
      label: 'GitHub',
      href: 'https://github.com/kanzaler123',
    },
  ],
  featuredProjects: [
    {
      id: 'night-notes',
      title: { en: 'Night Notes', zhCN: '夜间札记' },
      summary: {
        en: 'Thoughts gathered after the world grows quiet.',
        zhCN: '在世界安静下来后收集的思绪。',
      },
      category: { en: 'Notes', zhCN: '笔记' },
      tags: ['Writing', 'Reflection'],
      placeholder: true,
      imagePosition: '18% center',
    },
    {
      id: 'course-resources',
      title: { en: 'FDU Course Resources', zhCN: '复旦课程资料库' },
      summary: {
        en: 'Notes, slides, exercises, and references organized by course.',
        zhCN: '按课程整理的笔记、课件、习题与参考资料，可直接浏览和下载。',
      },
      category: { en: 'Open Resource', zhCN: '开放资料' },
      repo: 'fdu-course-resources',
      href: '#course-resources',
      tags: ['FDU', 'Education', 'Open Resource'],
      placeholder: false,
      imagePosition: '52% center',
    },
    {
      id: 'paper-reading',
      title: { en: 'Paper Reading', zhCN: '论文阅读' },
      summary: {
        en: 'Summaries and reflections on papers that spark new questions.',
        zhCN: '记录那些带来新问题的论文、摘要与思考。',
      },
      category: { en: 'Reading', zhCN: '阅读' },
      tags: ['Research', 'Learning'],
      placeholder: true,
      imagePosition: '82% center',
    },
  ],
  music: {
    src: '/audio/star-moon-fields.mp3',
    title: { en: 'Star Moon Fields', zhCN: '星月原野' },
    artist: '一颗狼星',
    defaultVolume: 0.25,
  },
};
