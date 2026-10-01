import Link from 'next/link';
import { getPageMap } from 'nextra/page-map';

import { postsOf } from './posts';

/**
 * The blog index (spec §6.2): every post, newest first. A server component,
 * so the list is in the exported HTML and Pagefind indexes it. The posts
 * migrate at 0.4.0 final (phase 3); until then the list is empty, and only
 * the `release` channel builds this page.
 */
export async function PostList() {
  const posts = postsOf(await getPageMap('/blog'));
  if (posts.length === 0) {
    return <p>The NexusDI blog posts move here at 0.4.0 final.</p>;
  }
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.route}>
          <Link href={post.route}>{post.title}</Link>{' '}
          <time dateTime={post.date}>{post.date}</time>
          {post.description === '' ? null : <p>{post.description}</p>}
        </li>
      ))}
    </ul>
  );
}
