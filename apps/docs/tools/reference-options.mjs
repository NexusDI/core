/**
 * The class prefixes the reference loader writes (spec section 22, item 3).
 *
 * `classPrefix` names the entry's own elements, which
 * `components/api/entry.css` styles. `kindPrefix` names the kind class, which
 * the API filter reads. The class carries no style, since an export kind shows
 * as a neutral chip. The loader
 * chain, the `.md` siblings and the repo-checks loaders read this one object,
 * so the three cannot disagree.
 */
export const referenceOptions = Object.freeze({
  classPrefix: 'nexus',
  kindPrefix: 'meridian',
});
