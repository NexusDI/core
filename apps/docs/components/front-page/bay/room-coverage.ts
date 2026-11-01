import { FRAME } from './geometry';

/**
 * Hides the room plates and leaders that a callout, a note or the hover
 * placard covers, and brings them back when it goes. The callout is the
 * outcome of what the visitor did, so it wins. The controller calls this after
 * every render, because a new state moves the callouts and a render is when the
 * bay changes state.
 */
export function applyRoomCoverage(root: Element): void {
  const layer = root.querySelector('.nexus-bay__wide .nexus-bay__rooms');
  const hull = layer?.closest('.nexus-bay__hull');
  if (!layer || !hull) return;
  const covers = [
    ...hull.querySelectorAll(
      '.nexus-bay__callout, .nexus-bay__note, .nexus-bay__placard',
    ),
  ].map((el) => el.getBoundingClientRect());
  const covered = (x: number, y: number) =>
    covers.some(
      (c) => x >= c.left && x <= c.right && y >= c.top && y <= c.bottom,
    );
  for (const plate of layer.querySelectorAll('[data-room-label]')) {
    const b = plate.getBoundingClientRect();
    plate.classList.toggle(
      'is-covered',
      covers.some(
        (c) =>
          b.left < c.right - 1 &&
          c.left < b.right - 1 &&
          b.top < c.bottom - 1 &&
          c.top < b.bottom - 1,
      ),
    );
  }
  const frame = layer
    .querySelector('.nexus-bay__leaders')
    ?.getBoundingClientRect();
  for (const line of layer.querySelectorAll('[data-leader]')) {
    const [a = [0, 0], b = [0, 0]] = (line.getAttribute('points') ?? '')
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    let hit = false;
    if (frame)
      for (let i = 0; i <= 40 && !hit; i++) {
        const t = i / 40;
        const x = (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t;
        const y = (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t;
        hit = covered(
          frame.left + ((x - FRAME[0]) / FRAME[2]) * frame.width,
          frame.top + ((y - FRAME[1]) / FRAME[3]) * frame.height,
        );
      }
    line.classList.toggle('is-covered', hit);
  }
}
