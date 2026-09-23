export interface PublishedPost {
  file: string;
  permalink: string;
}
export function newestPublishedPost(dir: string): PublishedPost | null;
export function announcementBar(
  post: PublishedPost | null,
): { id: string; content: string; isCloseable: boolean } | undefined;
