import { statedBy } from '@nexusdi/doc-examples/mdx-reference-loader';

/**
 * One sidecar per export whose rail lists a case: the cases `statedBy` puts in
 * that entry's rail, and the popups those cases point at, under the numbers
 * the tokens already carry.
 *
 * `exported` is every name the package exports across its entry points
 * (`exportedNames` in `@nexusdi/doc-examples/package-exports`). The reference
 * loader names an entry after the export it renders, so a `describe` title
 * that names an internal function (`buildView` in `@nexusdi/core`) names no
 * entry and gets no sidecar. `bodies` maps a case's id to its highlighted
 * body, and `popups` maps a popup's number to its HTML. Throws when two
 * exports differ only by case.
 */
export function sidecarsOf(project, contents, bodies, popups, exported) {
  const written = new Map();
  const out = [];

  for (const name of Object.keys(contents.states)) {
    if (!exported.has(name)) continue;

    const ids = statedBy(contents, name).groups.flatMap((group) =>
      group.rows.map((row) => String(row.id)),
    );
    if (ids.length === 0) continue;

    // A filesystem that ignores case (APFS and NTFS by default) would write
    // both names to one file, and a host that serves `out/` by case would
    // then answer one of the two fetches with the other export's cases.
    const folded = name.toLowerCase();
    if (written.has(folded))
      throw new Error(
        `${project.name} states both ${written.get(folded)} and ${name}, ` +
          'whose sidecars differ only by case',
      );
    written.set(folded, name);

    const held = Object.fromEntries(ids.map((id) => [id, bodies[id]]));
    const pointed = new Set(
      Object.values(held).flatMap(({ html }) =>
        [...html.matchAll(/data-pop="(\d+)"/g)].map(([, at]) => at),
      ),
    );

    out.push({
      name,
      sidecar: {
        package: project.name,
        name,
        bodies: held,
        popups: Object.fromEntries(
          [...pointed]
            .sort((left, right) => Number(left) - Number(right))
            .map((at) => [at, popups.get(at)]),
        ),
      },
    });
  }

  return out;
}
