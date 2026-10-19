import LegacyButton from '@/components/layout/LegacyButton';
import { formatDate } from '@/lib/format';

async function loadPost(slug: string[] | undefined) {
  const res = await fetch(`${process.env.CMS_URL}/posts/${slug?.join('/') ?? 'index'}`, { cache: 'force-cache' });
  return res.json() as Promise<{ title: string; html: string; publishedAt: string }>;
}

/** CMS-backed journal; still uses the deprecated LegacyButton. */
export default async function BlogPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  return (
    <article className="prose">
      <h1>{post.title}</h1>
      <time>{formatDate(post.publishedAt)}</time>
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
      <LegacyButton kind="primary">Subscribe</LegacyButton>
    </article>
  );
}
