import type { ReactNode } from 'react';

/**
 * A fence from a region of an example file, with the file's name in a placard
 * at the head of the fence (site UX spec 13.3). The copy button Nextra draws
 * sits at the head's end; `code.css` moves it there. `mdx-listing-loader.mjs`
 * wraps every `file=… region=…` fence in this element before the region
 * loader fills it.
 */
export default function Source({
  file,
  region,
  children,
}: {
  file: string;
  region: string;
  children: ReactNode;
}) {
  const name = file.split('/').pop() ?? file;
  return (
    <div className="nexus-source" data-region={region}>
      <p className="nexus-source__head">
        <span className="nexus-source__file">{name}</span>
        <span className="nexus-source__region">{region}</span>
      </p>
      {children}
    </div>
  );
}
