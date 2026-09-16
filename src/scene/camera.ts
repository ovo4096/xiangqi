import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export const boardCorners = [-5.34, 5.34].flatMap(x => [-.47, .55].flatMap(y => [-5.84, 5.84].map(z => new Vector3(x, y, z))));

/** Fit and optically center the full board, including pieces and near edge. */
export function boardCamera(view: 'perspective' | 'top', aspect: number, fov = 37) {
  const direction = (view === 'top' ? new Vector3(0, 1, .000001) : new Vector3(0, .84, .54)).normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const target = new Vector3(0, .04, 0);
  const tangent = Math.tan(MathUtils.degToRad(fov / 2));
  const distance = Math.max(...boardCorners.map(point => {
    const corner = point.clone().sub(target);
    return corner.dot(direction) + Math.max(Math.abs(corner.dot(right)) / (tangent * aspect * .9), Math.abs(corner.dot(up)) / (tangent * .9));
  }));
  const camera = new PerspectiveCamera(fov, aspect, .1, 100);
  for (let step = 0; step < 5; step++) {
    camera.position.copy(direction).multiplyScalar(distance).add(target);
    camera.lookAt(target); camera.updateMatrixWorld();
    const projected = boardCorners.map(point => point.clone().project(camera));
    const centerY = (Math.min(...projected.map(point => point.y)) + Math.max(...projected.map(point => point.y))) / 2;
    target.addScaledVector(up, centerY * distance * tangent);
  }
  return { target, position: direction.multiplyScalar(distance).add(target), distance };
}
