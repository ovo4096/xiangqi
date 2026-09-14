import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { pieceLabel, type Piece } from '../game/engine';

type Point = { x: number; y: number };
type LastMove = { from: Point; to: Point } | null;
type PieceView = {
  group: THREE.Group;
  piece: Piece;
  start: THREE.Vector3;
  destination: THREE.Vector3;
  started: number;
  moving: boolean;
};

const SURFACE = 0.171;
const BOARD_WIDTH = 9.72;
const BOARD_DEPTH = 10.72;
const PIECE_RADIUS = 0.425;
const GOLD = 0xe4bf79;

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

/** A continuous, fine-grained timber texture rather than a repeating image tile. */
function woodCanvas(width: number, height: number, dark = false, seed = 6) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(seed);
  const pixels = ctx.createImageData(width, height);
  const base = dark ? [80, 51, 33] : [195, 160, 111];
  const knots = [
    { x: width * 0.23, y: height * 0.32, strength: 4.5 },
    { x: width * 0.76, y: height * 0.83, strength: 3.2 },
  ];
  for (let y = 0; y < height; y++) {
    const bend = Math.sin(y / height * 4.8) * 12 + Math.sin(y / height * 13.5) * 3;
    for (let x = 0; x < width; x++) {
      let axis = x + bend;
      for (const knot of knots) {
        const dx = x - knot.x;
        const dy = (y - knot.y) * 0.29;
        axis += knot.strength * Math.atan2(dy, dx) * Math.exp(-(dx * dx + dy * dy) / (width * 15));
      }
      const longGrain = Math.sin(axis * 0.115 + Math.sin(axis * 0.031) * 2.2);
      const fineGrain = Math.sin(axis * 0.74 + Math.sin(y * 0.0034) * 2);
      const pores = Math.pow(Math.max(0, Math.sin(axis * 0.19 + Math.sin(axis * 0.012) * 3.8)), 15);
      const cloud = Math.sin(x * 0.0101 + Math.sin(y * 0.0029)) * 3.2;
      const grain = longGrain * 4 + fineGrain * 1.3 - pores * 7 + cloud + (random() - 0.5) * 5;
      const offset = (y * width + x) * 4;
      pixels.data[offset] = base[0] + grain;
      pixels.data[offset + 1] = base[1] + grain * 0.85;
      pixels.data[offset + 2] = base[2] + grain * 0.65;
      pixels.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  // Broken, hairline vessels are characteristic of real finished wood.
  for (let i = 0; i < width * 0.7; i++) {
    const x = random() * width;
    const y = random() * height;
    const length = (0.04 + random() * 0.7) * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 5, y + length * 0.3, x - 8, y + length * 0.7, x + 3, y + length);
    ctx.strokeStyle = dark ? `rgba(24,13,7,${random() * 0.12})` : `rgba(104,62,26,${random() * 0.12})`;
    ctx.lineWidth = 0.4 + random() * 0.7;
    ctx.stroke();
  }
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement, anisotropy = 8) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function boardTexture() {
  const width = 1536;
  const height = 1696;
  const canvas = woodCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const px = (x: number) => (x + BOARD_WIDTH / 2) / BOARD_WIDTH * width;
  const py = (z: number) => (z + BOARD_DEPTH / 2) / BOARD_DEPTH * height;
  const line = (x1: number, z1: number, x2: number, z2: number, weight = 3.6) => {
    ctx.beginPath();
    ctx.moveTo(px(x1), py(z1));
    ctx.lineTo(px(x2), py(z2));
    ctx.strokeStyle = '#49321f';
    ctx.lineWidth = weight;
    ctx.stroke();
  };
  // Faint light rims make the dark lines read as incised into the timber.
  ctx.shadowColor = 'rgba(255,225,164,.35)';
  ctx.shadowOffsetX = 0.8;
  ctx.shadowOffsetY = 1.3;
  for (let rank = 0; rank < 10; rank++) line(-4, rank - 4.5, 4, rank - 4.5);
  for (let file = 0; file < 9; file++) {
    if (file === 0 || file === 8) line(file - 4, -4.5, file - 4, 4.5, 4.4);
    else {
      line(file - 4, -4.5, file - 4, -0.5);
      line(file - 4, 0.5, file - 4, 4.5);
    }
  }
  line(-1, -4.5, 1, -2.5);
  line(1, -4.5, -1, -2.5);
  line(-1, 2.5, 1, 4.5);
  line(1, 2.5, -1, 4.5);
  const marker = (file: number, rank: number) => {
    const x = file - 4;
    const z = rank - 4.5;
    for (const sx of [-1, 1]) {
      if ((file === 0 && sx === -1) || (file === 8 && sx === 1)) continue;
      for (const sz of [-1, 1]) {
        line(x + sx * 0.08, z + sz * 0.08, x + sx * 0.22, z + sz * 0.08, 3.0);
        line(x + sx * 0.08, z + sz * 0.08, x + sx * 0.08, z + sz * 0.22, 3.0);
      }
    }
  };
  [2, 7].forEach(rank => [1, 7].forEach(file => marker(file, rank)));
  [3, 6].forEach(rank => [0, 2, 4, 6, 8].forEach(file => marker(file, rank)));
  ctx.strokeStyle = '#5b3f27';
  ctx.lineWidth = 3.6;
  ctx.strokeRect(px(-4.13), py(-4.63), px(4.13) - px(-4.13), py(4.63) - py(-4.63));
  ctx.lineWidth = 0.9;
  ctx.strokeRect(px(-4.19), py(-4.69), px(4.19) - px(-4.19), py(4.69) - py(-4.69));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '78px "STKaiti", "KaiTi", "Noto Serif SC", serif';
  ctx.fillStyle = '#594026';
  ctx.fillText('楚  河', px(-2), py(0) + 2);
  ctx.fillText('漢  界', px(2), py(0) + 2);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(99,64,34,.58)';
  ctx.font = '22px "STKaiti", "KaiTi", serif';
  ctx.fillText('弈  境', px(0), py(5.07));
  return canvasTexture(canvas);
}

function pieceFace(piece: Piece) {
  const canvas = woodCanvas(512, 512, false, piece.side === 'red' ? 49 : 18);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,235,192,.15)';
  ctx.fillRect(0, 0, 512, 512);
  // Turned grooves and an inner bevel surround the incised character.
  for (const [radius, width, color] of [
    [239, 3, 'rgba(91,54,24,.6)'],
    [235, 2, 'rgba(255,232,180,.85)'],
    [218, 2.2, 'rgba(106,68,34,.6)'],
    [215, 1.4, 'rgba(255,232,180,.7)'],
  ] as const) {
    ctx.beginPath();
    ctx.arc(256, 256, radius, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 324px "STKaiti", "KaiTi", "Noto Serif SC", "Songti SC", serif';
  const label = pieceLabel(piece);
  ctx.fillStyle = 'rgba(255,226,173,.8)';
  ctx.fillText(label, 258, 268);
  ctx.fillStyle = piece.side === 'red' ? '#861c19' : '#211e19';
  ctx.shadowColor = piece.side === 'red' ? 'rgba(63,14,9,.65)' : 'rgba(12,8,4,.65)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1.5;
  ctx.shadowBlur = 1.7;
  ctx.fillText(label, 256, 266);
  return canvasTexture(canvas);
}

function roundedSlab(width: number, depth: number, thickness: number, radius: number) {
  const x = -width / 2;
  const y = -depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelSegments: 3, steps: 1,
    bevelSize: 0.055, bevelThickness: 0.04, curveSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export class BoardScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE);
  private readonly views = new Map<string, PieceView>();
  private readonly faceMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly ownedTextures = new Set<THREE.Texture>();
  private readonly markers = new THREE.Group();
  private readonly selectedRing: THREE.Mesh;
  private readonly keyboardCursor: THREE.Group;
  private readonly resizeObserver: ResizeObserver;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly pieceGeometry: THREE.LatheGeometry;
  private readonly pieceSideMaterial: THREE.MeshStandardMaterial;
  private readonly faceGeometry = new THREE.CircleGeometry(0.398, 64);
  private readonly grooveGeometry = new THREE.TorusGeometry(0.423, 0.005, 5, 64);
  private readonly grooveMaterial = new THREE.MeshStandardMaterial({ color: 0x8c613c, roughness: 0.66 });
  private readonly markerDiscGeometry = new THREE.CircleGeometry(0.105, 24);
  private readonly markerRingGeometry = new THREE.RingGeometry(0.365, 0.405, 48);
  private readonly legalMaterial = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  private readonly lastMaterial = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.56, depthWrite: false, side: THREE.DoubleSide });
  private selectedId: string | null = null;
  private pointerDown: { x: number; y: number; id: number; moved: boolean } | null = null;
  private activePointers = new Set<number>();
  private frame = 0;
  private needsRender = true;
  private disposed = false;
  private view: 'perspective' | 'top' = 'perspective';
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly container: HTMLElement, private readonly onSelect: (x: number, y: number) => void) {
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      throw new Error('无法启动 3D 棋盘。请启用浏览器的硬件加速，或使用支持 WebGL 的浏览器。');
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setClearColor(0x171b19, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.30;
    room.dispose();
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffefda, 0x393a2d, 0.95));
    const key = new THREE.DirectionalLight(0xffedd6, 2.85);
    key.position.set(-5, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 35;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe5edff, 0.70);
    fill.position.set(7, 6, -5);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffdbb0, 0.85);
    rim.position.set(1, 4, -8);
    this.scene.add(rim);

    this.buildBoard();
    const profile: THREE.Vector2[] = [
      [0, 0], [.356, 0], [.393, .012], [.418, .041],
      [PIECE_RADIUS, .074], [PIECE_RADIUS, .202], [.42, .23],
      [.408, .257], [.398, .273], [0, .273],
    ].map(([radius, height]) => new THREE.Vector2(radius, height));
    this.pieceGeometry = new THREE.LatheGeometry(profile, 64);
    const pieceWood = canvasTexture(woodCanvas(768, 256, false, 43));
    this.ownedTextures.add(pieceWood);
    this.pieceSideMaterial = new THREE.MeshStandardMaterial({
      map: pieceWood, color: 0xe8c995, roughness: 0.43, metalness: 0,
      bumpMap: pieceWood, bumpScale: 0.014,
    });

    this.selectedRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.482, 0.022, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xf4cf88, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.selectedRing.rotation.x = -Math.PI / 2;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing, this.markers);
    this.keyboardCursor = this.buildKeyboardCursor();
    this.scene.add(this.keyboardCursor);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.025;
    this.controls.maxPolarAngle = Math.PI * 0.37;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.6;
    this.controls.minDistance = 11;
    this.controls.maxDistance = 36;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('change', this.invalidate);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }

  private buildBoard() {
    const walnut = canvasTexture(woodCanvas(1024, 1024, true, 11));
    walnut.wrapS = THREE.RepeatWrapping;
    walnut.wrapT = THREE.RepeatWrapping;
    walnut.repeat.set(.13, .13);
    this.ownedTextures.add(walnut);
    const walnutMaterial = new THREE.MeshStandardMaterial({ map: walnut, color: 0xd7b487, roughness: .43, bumpMap: walnut, bumpScale: .022 });
    const body = new THREE.Mesh(roundedSlab(10.52, 11.52, .34, .10), walnutMaterial);
    body.position.y = -.27;
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);

    const baseTrim = new THREE.Mesh(roundedSlab(10.43, 11.43, .07, .09), new THREE.MeshStandardMaterial({ color: 0x332219, roughness: .47 }));
    baseTrim.position.y = -.33;
    baseTrim.castShadow = true;
    this.scene.add(baseTrim);

    const veneer = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH + .025, .08, BOARD_DEPTH + .025), new THREE.MeshStandardMaterial({ color: 0xa97848, roughness: .5 }));
    veneer.position.y = SURFACE - .041;
    veneer.castShadow = true;
    veneer.receiveShadow = true;
    this.scene.add(veneer);
    const engraving = boardTexture();
    this.ownedTextures.add(engraving);
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_DEPTH), new THREE.MeshStandardMaterial({ map: engraving, roughness: .58, bumpMap: engraving, bumpScale: .009 }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = SURFACE;
    surface.receiveShadow = true;
    this.scene.add(surface);

    const inlayMaterial = new THREE.MeshStandardMaterial({ color: 0xd6ac68, roughness: .43, metalness: .12 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.014, .012, BOARD_DEPTH + .065), inlayMaterial);
      rail.position.set(side * (BOARD_WIDTH / 2 + .027), SURFACE - .005, 0);
      this.scene.add(rail);
      const end = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH + .069, .012, .014), inlayMaterial);
      end.position.set(0, SURFACE - .005, side * (BOARD_DEPTH / 2 + .027));
      this.scene.add(end);
    }
    // Slightly inset feet give the slab a believable floating contact shadow.
    const footMaterial = new THREE.MeshStandardMaterial({ color: 0x35271c, roughness: .85 });
    for (const x of [-3.8, 3.8]) for (const z of [-4.3, 4.3]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(.36, .31, .09, 24), footMaterial);
      foot.position.set(x, -.42, z);
      foot.castShadow = true;
      this.scene.add(foot);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x050805, opacity: .33 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.467;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildKeyboardCursor() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xf3deb3, transparent: true, opacity: .9, depthWrite: false });
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(.16, .01, .025), material);
      a.position.set(x * .37, 0, z * .44);
      const b = new THREE.Mesh(new THREE.BoxGeometry(.025, .01, .16), material);
      b.position.set(x * .44, 0, z * .37);
      group.add(a, b);
    }
    group.visible = false;
    return group;
  }

  private createPiece(piece: Piece) {
    const group = new THREE.Group();
    group.userData.pieceId = piece.id;
    const body = new THREE.Mesh(this.pieceGeometry, this.pieceSideMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const key = `${piece.side}-${piece.type}`;
    let faceMaterial = this.faceMaterials.get(key);
    if (!faceMaterial) {
      const texture = pieceFace(piece);
      this.ownedTextures.add(texture);
      faceMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .49, metalness: 0, bumpMap: texture, bumpScale: .007 });
      this.faceMaterials.set(key, faceMaterial);
    }
    const face = new THREE.Mesh(this.faceGeometry, faceMaterial);
    face.rotation.x = -Math.PI / 2;
    face.position.y = .274;
    face.receiveShadow = true;
    group.add(face);
    for (const height of [.067, .214]) {
      const groove = new THREE.Mesh(this.grooveGeometry, this.grooveMaterial);
      groove.rotation.x = -Math.PI / 2;
      groove.position.y = height;
      group.add(groove);
    }
    this.scene.add(group);
    const position = new THREE.Vector3(piece.x - 4, SURFACE + .006, piece.y - 4.5);
    group.position.copy(position);
    const view: PieceView = { group, piece, start: position.clone(), destination: position.clone(), started: 0, moving: false };
    this.views.set(piece.id, view);
    return view;
  }

  setPosition(pieces: Piece[], selectedId: string | null, legal: Point[], lastMove: LastMove) {
    this.selectedId = selectedId;
    const ids = new Set(pieces.map(piece => piece.id));
    for (const [id, view] of this.views) if (!ids.has(id)) {
      this.scene.remove(view.group);
      this.views.delete(id);
    }
    for (const piece of pieces) {
      const view = this.views.get(piece.id) ?? this.createPiece(piece);
      const target = new THREE.Vector3(piece.x - 4, SURFACE + .006, piece.y - 4.5);
      if (view.destination.distanceToSquared(target) > .001) {
        view.start.copy(view.group.position);
        view.destination.copy(target);
        view.started = performance.now();
        view.moving = !this.reducedMotion;
        if (this.reducedMotion) view.group.position.copy(target);
      }
      view.piece = piece;
    }
    this.markers.clear();
    if (lastMove) {
      for (const point of [lastMove.from, lastMove.to]) {
        const marker = new THREE.Mesh(this.markerRingGeometry, this.lastMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.scale.setScalar(1.2);
        marker.position.set(point.x - 4, SURFACE + .009, point.y - 4.5);
        this.markers.add(marker);
      }
    }
    for (const point of legal) {
      const occupied = pieces.some(piece => piece.x === point.x && piece.y === point.y);
      const marker = new THREE.Mesh(occupied ? this.markerRingGeometry : this.markerDiscGeometry, this.legalMaterial);
      marker.rotation.x = -Math.PI / 2;
      if (occupied) marker.scale.setScalar(1.2);
      marker.position.set(point.x - 4, SURFACE + .014, point.y - 4.5);
      this.markers.add(marker);
    }
    this.selectedRing.visible = Boolean(selectedId && this.views.has(selectedId));
    if (selectedId) {
      const view = this.views.get(selectedId);
      if (view) this.selectedRing.position.set(view.destination.x, SURFACE + .024, view.destination.z);
    }
    this.invalidate();
  }

  setKeyboardCursor(position: Point | null) {
    this.keyboardCursor.visible = position !== null;
    if (position) this.keyboardCursor.position.set(position.x - 4, SURFACE + .027, position.y - 4.5);
    this.invalidate();
  }

  setView(view: 'perspective' | 'top') {
    this.view = view;
    this.resetView();
  }

  resetView() {
    const aspect = this.camera.aspect || 1;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const direction = this.view === 'top'
      ? new THREE.Vector3(0, 1, .027).normalize()
      : new THREE.Vector3(.018, .80, .60).normalize();
    const target = new THREE.Vector3(0, 0, this.view === 'top' ? 0 : .32);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(halfFov) * .92;
    let distance = 0;
    // Fit the entire physical object, including the near edge and its thickness.
    // Perspective foreshortening makes a width/height-only fit crop that edge.
    for (const x of [-5.34, 5.34]) for (const y of [-.47, .55]) for (const z of [-5.84, 5.84]) {
      const corner = new THREE.Vector3(x, y, z).sub(target);
      distance = Math.max(distance, corner.dot(direction) + Math.max(
        Math.abs(corner.dot(right)) / (tangent * aspect),
        Math.abs(corner.dot(up)) / tangent,
      ));
    }
    this.controls.target.copy(target);
    this.camera.position.copy(direction.multiplyScalar(distance)).add(target);
    this.controls.minDistance = Math.max(10, distance * .66);
    this.controls.maxDistance = Math.max(31, distance * 1.55);
    this.controls.update();
    this.invalidate();
  }

  private resize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.resetView();
  };

  private invalidate = () => { this.needsRender = true; };

  private pointAt(event: PointerEvent): Point | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.views.values()].map(view => view.group), true);
    for (const hit of intersections) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.pieceId) object = object.parent;
      const view = object && this.views.get(object.userData.pieceId);
      if (view) return { x: view.piece.x, y: view.piece.y };
    }
    const hit = this.raycaster.ray.intersectPlane(this.boardPlane, new THREE.Vector3());
    if (!hit) return null;
    const x = Math.round(hit.x + 4);
    const y = Math.round(hit.z + 4.5);
    if (x < 0 || x > 8 || y < 0 || y > 9 || Math.abs(hit.x + 4 - x) > .49 || Math.abs(hit.z + 4.5 - y) > .49) return null;
    return { x, y };
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.activePointers.add(event.pointerId);
    this.pointerDown = this.activePointers.size === 1
      ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false }
      : null;
  };

  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.activePointers.delete(event.pointerId);
    this.pointerDown = null;
    if (!down || down.moved || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const point = this.pointAt(event);
    if (point) this.onSelect(point.x, point.y);
  };

  private onPointerCancel = (event: PointerEvent) => {
    this.activePointers.delete(event.pointerId);
    this.pointerDown = null;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.pointerDown && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 6) this.pointerDown.moved = true;
    this.renderer.domElement.style.cursor = this.pointerDown ? 'grabbing' : this.pointAt(event) ? 'pointer' : 'grab';
  };

  private onContextMenu = (event: Event) => { event.preventDefault(); };

  private animate = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    let animating = false;
    for (const view of this.views.values()) {
      if (view.moving) {
        const progress = Math.min(1, (now - view.started) / 300);
        const eased = 1 - Math.pow(1 - progress, 3);
        view.group.position.lerpVectors(view.start, view.destination, eased);
        view.group.position.y += Math.sin(progress * Math.PI) * .32;
        view.moving = progress < 1;
        animating = true;
      } else {
        const height = view.destination.y + (view.piece.id === this.selectedId ? .075 : 0);
        const delta = height - view.group.position.y;
        if (Math.abs(delta) > .001) {
          view.group.position.y += this.reducedMotion ? delta : delta * .18;
          animating = true;
        }
      }
    }
    if (this.needsRender || animating) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
      if (object instanceof THREE.Light && 'shadow' in object) {
        (object as THREE.DirectionalLight).shadow?.dispose();
      }
    });
    // Some shared objects may be detached after a capture or marker update.
    [this.pieceGeometry, this.faceGeometry, this.grooveGeometry, this.markerDiscGeometry, this.markerRingGeometry].forEach(geometry => geometries.add(geometry));
    [this.pieceSideMaterial, this.grooveMaterial, this.legalMaterial, this.lastMaterial, ...this.faceMaterials.values()].forEach(material => materials.add(material));
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.ownedTextures.forEach(texture => texture.dispose());
    this.environment.dispose();
    this.renderer.dispose();
    canvas.remove();
    this.views.clear();
  }
}
