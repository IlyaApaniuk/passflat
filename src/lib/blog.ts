import fs from 'fs';
import path from 'path';

export interface BlogPost {
  slug: string;
  locale: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  content: string;
}

interface FrontMatter {
  title: string;
  description: string;
  date: string;
  locale: string;
  slug: string;
  tags: string[];
}

const CONTENT_DIR = path.join(process.cwd(), 'src/content/blog');

function parseFrontMatter(raw: string): { data: FrontMatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Invalid MDX frontmatter');

  const frontMatterBlock = match[1];
  const content = match[2].trim();

  const data: Record<string, unknown> = {};
  for (const line of frontMatterBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''));
    } else if (typeof value === 'string') {
      value = value.replace(/^["']|["']$/g, '');
    }

    data[key] = value;
  }

  return { data: data as unknown as FrontMatter, content };
}

export function getAllPosts(locale?: string): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'));

  const posts: BlogPost[] = files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const { data, content } = parseFrontMatter(raw);
    return {
      slug: data.slug,
      locale: data.locale,
      title: data.title,
      description: data.description,
      date: data.date,
      tags: data.tags,
      content,
    };
  });

  const filtered = locale ? posts.filter((p) => p.locale === locale) : posts;
  return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string, locale: string): BlogPost | undefined {
  const posts = getAllPosts();
  return posts.find((p) => p.slug === slug && p.locale === locale);
}

export function getPostSlugs(): { slug: string; locale: string }[] {
  return getAllPosts().map((p) => ({ slug: p.slug, locale: p.locale }));
}
