import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { boardCamera, boardCorners } from './camera';

for (const view of ['perspective', 'top'] as const) test(`${view}: complete board stays centered and visible across window shapes`, () => {
  for (const aspect of [.65, .9, 1, 1.5, 2.4]) {
    const { position, target } = boardCamera(view, aspect);
    const camera = new PerspectiveCamera(37, aspect, .1, 100);
    camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld();
    const projected = boardCorners.map(point => point.clone().project(camera));
    for (const point of projected) assert.ok(Math.abs(point.x) < .95 && Math.abs(point.y) < .95, `${aspect}: clipped board corner`);
    for (const axis of ['x', 'y'] as const) assert.ok(Math.abs(Math.max(...projected.map(point => point[axis])) + Math.min(...projected.map(point => point[axis]))) < .001, `${aspect}: off-center ${axis}`);
    if (view === 'top') assert.ok(position.clone().sub(target).normalize().y > .999999, 'Top view must look straight down');
  }
});
