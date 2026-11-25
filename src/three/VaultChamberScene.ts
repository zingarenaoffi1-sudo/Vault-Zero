import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GamePhase, RoundPhase, VaultDef } from '../game/types';
import {
  createBrushedSteelBump,
  createConcreteFloorTextures,
  createContactShadowTexture,
  createGaugeDialTexture,
  createVaultPlaqueTexture,
} from './proceduralTextures';

export interface VaultSceneState {
  gamePhase: GamePhase;
  roundPhase: RoundPhase;
  vaults: VaultDef[];
  selectedIndex: number | null;
  hoveredIndex: number | null;
  decoyIndex: number | null;
  /** Per-vault pressure normalized 0..1 */
  pressures: number[];
  /** Indices of exploded vaults during reveal */
  explodedIndices: number[];
  /** True if player's chosen vault survived & unlocked */
  playerSafeIndex: number | null;
  /** Index of player's vault if Round 3 STEAL deadbolts jammed */
  stealBustedIndex: number | null;
}

interface VaultAssembly {
  index: number;
  root: THREE.Group;
  doorPivot: THREE.Group;
  wheel: THREE.Group;
  bolts: THREE.Mesh[];
  gaugeNeedle: THREE.Object3D;
  beaconMat: THREE.MeshStandardMaterial;
  beaconLight: THREE.PointLight | null;
  floorRingMat: THREE.MeshBasicMaterial;
  decoyGroup: THREE.Group;
  bullionGroup: THREE.Group;
  hitbox: THREE.Mesh;
  plaqueTexture: THREE.CanvasTexture;
  worldPos: THREE.Vector3;
  // Kinematic state
  doorAngle: number;
  targetDoorAngle: number;
  doorBlowOffsetZ: number;
  doorBlowTiltX: number;
  wheelSpeed: number;
  needleAngle: number;
}

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

const PARTICLE_COUNT = 140;
const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _scaleVec = new THREE.Vector3();
const _color = new THREE.Color();

export class VaultChamberScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private chamberGroup = new THREE.Group();
  private vaultsRoot = new THREE.Group();
  private vaultAssemblies: VaultAssembly[] = [];
  private interactables: THREE.Object3D[] = [];

  private sharedGeos: THREE.BufferGeometry[] = [];
  private sharedMats: THREE.Material[] = [];
  private sharedTextures: THREE.Texture[] = [];
  private vaultDynamicGeos: THREE.BufferGeometry[] = [];
  private vaultDynamicMats: THREE.Material[] = [];
  private gaugeDialTexture: THREE.CanvasTexture;
  private brushedBump: THREE.CanvasTexture;
  private contactShadowTex: THREE.CanvasTexture;

  // Pooled zero-GC particles (sparks & gold bars)
  private particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private particleCursor = 0;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2(-99, -99);
  private lastRaycastMs = 0;
  private currentHoverIndex: number | null = null;

  // Callbacks
  private onHoverChange: (index: number | null) => void;
  private onVaultClick: (index: number) => void;
  private onContextLost: (() => void) | undefined;

  // State mirror
  private state: VaultSceneState = {
    gamePhase: 'title',
    roundPhase: 'selecting',
    vaults: [],
    selectedIndex: null,
    hoveredIndex: null,
    decoyIndex: null,
    pressures: [],
    explodedIndices: [],
    playerSafeIndex: null,
    stealBustedIndex: null,
  };

  // Loop & animation
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private elapsed = 0;
  private cameraTrauma = 0;
  private camPosCurrent = new THREE.Vector3(0, 7.6, 13.5);
  private camLookCurrent = new THREE.Vector3(0, 1.8, -1.2);
  private camPosTarget = new THREE.Vector3(0, 7.6, 13.5);
  private camLookTarget = new THREE.Vector3(0, 1.8, -1.2);
  private resizeObserver: ResizeObserver;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  constructor(
    container: HTMLElement,
    callbacks: {
      onHoverChange: (index: number | null) => void;
      onVaultClick: (index: number) => void;
      onContextLost?: (() => void) | undefined;
    }
  ) {
    this.container = container;
    this.onHoverChange = callbacks.onHoverChange;
    this.onVaultClick = callbacks.onVaultClick;
    this.onContextLost = callbacks.onContextLost;

    // 1. Accurate software-WebGL detection (matches GPU scene & lighting 1-to-1)
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer.setSize(width, height);
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, horizon-matched fog, and studio RoomEnvironment reflections
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1115);
    this.scene.fog = new THREE.FogExp2(0x0d1115, 0.026);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = envTex;
    this.sharedTextures.push(envTex);
    roomEnv.dispose();
    pmrem.dispose();

    // 3. Camera (aspect-aware FOV so narrow mobile viewports frame all 5 vaults cleanly)
    const initAspect = width / height;
    const initFov = initAspect < 1 ? Math.min(62, 42 + (1 - initAspect) * 38) : 42;
    this.camera = new THREE.PerspectiveCamera(initFov, initAspect, 0.2, 110);
    this.camera.position.copy(this.camPosCurrent);
    this.camera.lookAt(this.camLookCurrent);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = initAspect < 1 ? 0.013 : 0.022;
    }

    // 4. Shared procedural textures
    this.gaugeDialTexture = createGaugeDialTexture(this.maxAnisotropy);
    this.brushedBump = createBrushedSteelBump(this.maxAnisotropy);
    this.contactShadowTex = createContactShadowTexture();
    this.sharedTextures.push(this.gaugeDialTexture, this.brushedBump, this.contactShadowTex);

    // 5. Three-point architectural lighting rig (warm halogen key + cool slate fill + brass rim)
    const hemi = new THREE.HemisphereLight(0x88a4c4, 0x201c18, 0.95);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe1b8, 2.2);
    keyLight.position.set(6, 13, 10);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 34;
      keyLight.shadow.camera.left = -12;
      keyLight.shadow.camera.right = 12;
      keyLight.shadow.camera.top = 10;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6da6d8, 0.85);
    rimLight.position.set(-10, 7, -6);
    this.scene.add(rimLight);

    // 6. Build static brutalist vault chamber architecture
    this.buildChamberArchitecture();
    this.scene.add(this.chamberGroup);
    this.scene.add(this.vaultsRoot);

    // 7. Pre-allocated zero-GC particle ring buffer
    const pGeo = new THREE.BoxGeometry(0.18, 0.09, 0.34);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.82,
    });
    this.sharedGeos.push(pGeo);
    this.sharedMats.push(pMat);
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -50, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: 0,
        life: 0,
        maxLife: 1,
        color: new THREE.Color(0xf59e0b),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xf59e0b));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // 8. Listeners & ResizeObserver
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundContextLost = (e: Event) => {
      e.preventDefault();
      this.onContextLost?.();
    };
    this.boundContextRestored = () => {
      this.renderer.render(this.scene, this.camera);
    };

    this.renderer.domElement.addEventListener('pointermove', this.boundPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown);
    this.renderer.domElement.addEventListener('webglcontextlost', this.boundContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.boundContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Re-draw vault plaques crisply once web fonts finish loading
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (this.disposed || this.state.vaults.length === 0) return;
          const current = this.state.vaults;
          this.state.vaults = [];
          this.setVaults(current);
        })
        .catch(() => {});
    }

    // Start frame loop (GPU rAF vs Software WebGL afterDraw pacing)
    this.tick();
  }

  private buildChamberArchitecture(): void {
    const { map: floorMap, bumpMap: floorBump } = createConcreteFloorTextures(this.maxAnisotropy);
    this.sharedTextures.push(floorMap, floorBump);

    // Heavy concrete floor extending beyond view into horizon fog
    const floorGeo = new THREE.PlaneGeometry(52, 42);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorMap,
      bumpMap: floorBump,
      bumpScale: 0.04,
      roughness: 0.78,
      metalness: 0.14,
    });
    this.sharedGeos.push(floorGeo);
    this.sharedMats.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.chamberGroup.add(floor);

    // Recessed semicircular brass tactical floor inlay arcs (y = 0.018 to avoid Z-fighting)
    const arcMat = new THREE.MeshStandardMaterial({
      color: 0xb88a44,
      roughness: 0.32,
      metalness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.sharedMats.push(arcMat);

    for (const radius of [5.8, 10.6]) {
      const ringGeo = new THREE.RingGeometry(radius - 0.045, radius + 0.045, 72, 1, Math.PI * 1.05, Math.PI * 0.9);
      this.sharedGeos.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, arcMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.018, 5.2);
      this.chamberGroup.add(ring);
    }

    // Curved brutalist chamber outer cornice & elevated overhead gantry beams (above camera sightline)
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x20272f,
      roughness: 0.86,
      metalness: 0.08,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x161b20,
      roughness: 0.42,
      metalness: 0.75,
    });
    this.sharedMats.push(concreteMat, darkSteelMat);

    const beamGeo = new THREE.BoxGeometry(26, 0.55, 0.8);
    this.sharedGeos.push(beamGeo);
    for (const z of [-6.8, -3.2]) {
      const beam = new THREE.Mesh(beamGeo, darkSteelMat);
      beam.position.set(0, 7.2, z);
      this.chamberGroup.add(beam);
    }

    // Flanking architectural side pillars framing the wide vault gallery
    const pillarGeo = new THREE.BoxGeometry(1.6, 7.2, 2.2);
    this.sharedGeos.push(pillarGeo);
    for (const side of [-1, 1]) {
      const p1 = new THREE.Mesh(pillarGeo, concreteMat);
      p1.position.set(side * 10.8, 3.6, -2.4);
      p1.receiveShadow = true;
      p1.castShadow = true;
      this.chamberGroup.add(p1);

      const p2 = new THREE.Mesh(pillarGeo, concreteMat);
      p2.position.set(side * 11.8, 3.6, 2.0);
      p2.receiveShadow = true;
      this.chamberGroup.add(p2);
    }

    // Central raised brass tactical compass medallion on the floor
    const medGeo = new THREE.CylinderGeometry(1.15, 1.28, 0.06, 32);
    const medInnerGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.08, 32);
    this.sharedGeos.push(medGeo, medInnerGeo);
    const medBase = new THREE.Mesh(medGeo, arcMat);
    medBase.position.set(0, 0.03, 3.4);
    const medCore = new THREE.Mesh(medInnerGeo, darkSteelMat);
    medCore.position.set(0, 0.055, 3.4);
    this.chamberGroup.add(medBase, medCore);
  }

  private clearVaults(): void {
    for (const v of this.vaultAssemblies) {
      v.plaqueTexture.dispose();
      v.beaconMat.dispose();
      v.floorRingMat.dispose();
    }
    for (const g of this.vaultDynamicGeos) g.dispose();
    for (const m of this.vaultDynamicMats) m.dispose();
    this.vaultDynamicGeos = [];
    this.vaultDynamicMats = [];
    this.vaultAssemblies = [];
    this.interactables = [];
    this.currentHoverIndex = null;
    while (this.vaultsRoot.children.length > 0) {
      const child = this.vaultsRoot.children[0];
      if (child) this.vaultsRoot.remove(child);
    }
  }

  /**
   * Builds a curved gallery of composite 10-part 3D armored vault doors for the active round.
   */
  public setVaults(vaults: VaultDef[]): void {
    // Skip rebuild if identical vault signature
    const sigNow = vaults.map((v) => `${v.code}:${v.jackpot}:${v.multiplier}`).join('|');
    const sigPrev = this.state.vaults.map((v) => `${v.code}:${v.jackpot}:${v.multiplier}`).join('|');
    if (sigNow === sigPrev && this.vaultAssemblies.length === vaults.length) {
      return;
    }

    this.clearVaults();
    const count = vaults.length;
    if (count === 0) return;

    const concreteWallMat = new THREE.MeshStandardMaterial({
      color: 0x252d36,
      roughness: 0.85,
      metalness: 0.08,
    });
    const steelFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1b2128,
      roughness: 0.42,
      metalness: 0.78,
    });
    const doorSteelMat = new THREE.MeshStandardMaterial({
      color: 0x3b4652,
      bumpMap: this.brushedBump,
      bumpScale: 0.025,
      roughness: 0.36,
      metalness: 0.82,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a44a,
      roughness: 0.22,
      metalness: 0.92,
    });
    const chromeBoltMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.18,
      metalness: 0.94,
    });
    const interiorDarkMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e12,
      roughness: 0.92,
      metalness: 0.1,
    });
    const goldBarMat = new THREE.MeshStandardMaterial({
      color: 0xffc83d,
      emissive: 0x6b4400,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.96,
    });
    const decoyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.88,
    });
    this.vaultDynamicMats.push(
      concreteWallMat,
      steelFrameMat,
      doorSteelMat,
      brassMat,
      chromeBoltMat,
      interiorDarkMat,
      goldBarMat,
      decoyMat
    );

    // Shared sub-geometries across all vault bays
    const wallBackingGeo = new THREE.BoxGeometry(3.2, 5.2, 1.5);
    const jambGeo = new THREE.BoxGeometry(0.32, 3.1, 0.56);
    const lintelGeo = new THREE.BoxGeometry(2.58, 0.38, 0.62);
    const thresholdGeo = new THREE.BoxGeometry(2.5, 0.08, 0.76);
    const doorSlabGeo = new THREE.BoxGeometry(1.9, 2.74, 0.24);
    const doorInnerPlateGeo = new THREE.BoxGeometry(1.52, 2.34, 0.07);
    const hingeGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.44, 14);
    const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12);
    boltGeo.rotateZ(Math.PI / 2);
    const wheelRimGeo = new THREE.TorusGeometry(0.42, 0.055, 12, 28);
    const wheelSpokeGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.82, 10);
    const wheelHubGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.16, 16);
    wheelHubGeo.rotateX(Math.PI / 2);
    const plaqueGeo = new THREE.BoxGeometry(2.15, 0.74, 0.12);
    const gaugeRimGeo = new THREE.CylinderGeometry(0.36, 0.4, 0.14, 24);
    gaugeRimGeo.rotateX(Math.PI / 2);
    const gaugeFaceGeo = new THREE.CircleGeometry(0.31, 24);
    const needleGeo = new THREE.BoxGeometry(0.04, 0.25, 0.02);
    needleGeo.translate(0, 0.1, 0);
    const beaconBaseGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.14, 16);
    const beaconDomeGeo = new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const floorRingGeo = new THREE.RingGeometry(0.84, 1.04, 36);
    floorRingGeo.rotateX(-Math.PI / 2);
    const shadowDiscGeo = new THREE.PlaneGeometry(2.9, 2.2);
    shadowDiscGeo.rotateX(-Math.PI / 2);
    const bullionBarGeo = new THREE.BoxGeometry(0.46, 0.2, 0.24);
    const decoyGeo = new THREE.OctahedronGeometry(0.32, 0);
    const hitboxGeo = new THREE.BoxGeometry(2.65, 4.6, 1.5);

    this.vaultDynamicGeos.push(
      wallBackingGeo,
      jambGeo,
      lintelGeo,
      thresholdGeo,
      doorSlabGeo,
      doorInnerPlateGeo,
      hingeGeo,
      boltGeo,
      wheelRimGeo,
      wheelSpokeGeo,
      wheelHubGeo,
      plaqueGeo,
      gaugeRimGeo,
      gaugeFaceGeo,
      needleGeo,
      beaconBaseGeo,
      beaconDomeGeo,
      floorRingGeo,
      shadowDiscGeo,
      bullionBarGeo,
      decoyGeo,
      hitboxGeo
    );

    const spanAngle = count === 3 ? 0.58 : 1.06;
    const arcRadius = count === 3 ? 11.4 : 12.2;

    vaults.forEach((vault, idx) => {
      const t = count === 1 ? 0.5 : idx / (count - 1);
      const angle = (t - 0.5) * spanAngle;
      const x = Math.sin(angle) * arcRadius;
      const z = -Math.cos(angle) * arcRadius + 6.4;

      const root = new THREE.Group();
      root.position.set(x, 0, z);
      root.rotation.y = -angle;

      // 1. Solid concrete wall surround framing the vault flush into the chamber
      const wallLeft = new THREE.Mesh(wallBackingGeo, concreteWallMat);
      wallLeft.scale.set(0.26, 1.05, 1);
      wallLeft.position.set(-1.52, 2.7, -0.58);
      wallLeft.receiveShadow = true;
      wallLeft.castShadow = true;

      const wallRight = new THREE.Mesh(wallBackingGeo, concreteWallMat);
      wallRight.scale.set(0.26, 1.05, 1);
      wallRight.position.set(1.52, 2.7, -0.58);
      wallRight.receiveShadow = true;
      wallRight.castShadow = true;

      const wallTop = new THREE.Mesh(wallBackingGeo, concreteWallMat);
      wallTop.scale.set(1.16, 0.45, 1);
      wallTop.position.set(0, 4.28, -0.58);
      wallTop.receiveShadow = true;

      const wallBack = new THREE.Mesh(wallBackingGeo, interiorDarkMat);
      wallBack.scale.set(0.74, 0.65, 0.16);
      wallBack.position.set(0, 1.65, -1.25);

      root.add(wallLeft, wallRight, wallTop, wallBack);

      // 2. Heavy steel door frame jambs + lintel + threshold
      const leftJamb = new THREE.Mesh(jambGeo, steelFrameMat);
      leftJamb.position.set(-1.12, 1.55, 0.02);
      leftJamb.castShadow = true;
      const rightJamb = new THREE.Mesh(jambGeo, steelFrameMat);
      rightJamb.position.set(1.12, 1.55, 0.02);
      rightJamb.castShadow = true;
      const lintel = new THREE.Mesh(lintelGeo, steelFrameMat);
      lintel.position.set(0, 3.12, 0.05);
      lintel.castShadow = true;
      const threshold = new THREE.Mesh(thresholdGeo, steelFrameMat);
      threshold.position.set(0, 0.04, 0.12);
      root.add(leftJamb, rightJamb, lintel, threshold);

      // 3. Interior 3D Bullion Gold Stack (visible when safe door swings open!)
      const bullionGroup = new THREE.Group();
      bullionGroup.position.set(0, 0.12, -0.62);
      const rows = [
        { y: 0.1, cols: 3, z: 0 },
        { y: 0.31, cols: 2, z: -0.02 },
        { y: 0.52, cols: 1, z: -0.04 },
      ];
      rows.forEach((row) => {
        for (let c = 0; c < row.cols; c++) {
          const bar = new THREE.Mesh(bullionBarGeo, goldBarMat);
          bar.position.set((c - (row.cols - 1) / 2) * 0.52, row.y, row.z);
          bullionGroup.add(bar);
        }
      });
      root.add(bullionGroup);

      // 4. Hinged Armored Vault Door Assembly (pivots cleanly at left edge x = -0.95)
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-0.95, 1.52, 0.18);

      const slab = new THREE.Mesh(doorSlabGeo, doorSteelMat);
      slab.position.set(0.95, 0, 0);
      slab.castShadow = true;
      slab.receiveShadow = true;

      const innerPlate = new THREE.Mesh(doorInnerPlateGeo, steelFrameMat);
      innerPlate.position.set(0.95, 0, 0.13);

      // Heavy hinge barrels
      const hingeTop = new THREE.Mesh(hingeGeo, brassMat);
      hingeTop.position.set(0.02, 0.88, 0.14);
      const hingeBot = new THREE.Mesh(hingeGeo, brassMat);
      hingeBot.position.set(0.02, -0.88, 0.14);

      // Retractable locking bolts
      const bolts: THREE.Mesh[] = [];
      for (const by of [-0.72, 0, 0.72]) {
        const bolt = new THREE.Mesh(boltGeo, chromeBoltMat);
        bolt.position.set(1.92, by, 0.02);
        doorPivot.add(bolt);
        bolts.push(bolt);
      }

      // Iconic Brass Vault Wheel
      const wheel = new THREE.Group();
      wheel.position.set(0.95, -0.05, 0.24);
      const rim = new THREE.Mesh(wheelRimGeo, brassMat);
      const spoke1 = new THREE.Mesh(wheelSpokeGeo, brassMat);
      const spoke2 = new THREE.Mesh(wheelSpokeGeo, brassMat);
      spoke2.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(wheelHubGeo, chromeBoltMat);
      wheel.add(rim, spoke1, spoke2, hub);

      doorPivot.add(slab, innerPlate, hingeTop, hingeBot, wheel);
      root.add(doorPivot);

      // 5. Crisp Brass Jackpot Plaque above lintel
      const plaqueTex = createVaultPlaqueTexture(
        vault.code,
        vault.jackpot,
        vault.multiplier,
        vault.accentHex,
        this.maxAnisotropy
      );
      const plaqueFaceMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: plaqueTex,
        roughness: 0.35,
        metalness: 0.4,
      });
      this.vaultDynamicMats.push(plaqueFaceMat);
      const plaqueMesh = new THREE.Mesh(plaqueGeo, [
        brassMat,
        brassMat,
        brassMat,
        brassMat,
        plaqueFaceMat,
        steelFrameMat,
      ]);
      plaqueMesh.position.set(0, 3.74, 0.22);
      root.add(plaqueMesh);

      // 6. Overhead Analog Pressure Gauge
      const gaugeGroup = new THREE.Group();
      gaugeGroup.position.set(0.56, 4.58, 0.2);
      const gRim = new THREE.Mesh(gaugeRimGeo, brassMat);
      const gFaceMat = new THREE.MeshBasicMaterial({ map: this.gaugeDialTexture });
      const gFace = new THREE.Mesh(gaugeFaceGeo, gFaceMat);
      gFace.position.z = 0.08;
      const needleMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
      this.vaultDynamicMats.push(gFaceMat, needleMat);
      const needlePivot = new THREE.Group();
      needlePivot.position.z = 0.095;
      const needle = new THREE.Mesh(needleGeo, needleMat);
      needlePivot.add(needle);
      needlePivot.rotation.z = 2.1; // starts low left
      gaugeGroup.add(gRim, gFace, needlePivot);
      root.add(gaugeGroup);

      // 7. Overhead Klaxon Beacon
      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(-0.6, 4.48, 0.2);
      const bBase = new THREE.Mesh(beaconBaseGeo, steelFrameMat);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x3b444f,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.22,
        metalness: 0.25,
      });
      const bDome = new THREE.Mesh(beaconDomeGeo, beaconMat);
      bDome.position.y = 0.05;
      beaconGroup.add(bBase, bDome);
      root.add(beaconGroup);

      // 8. Soft contact shadow + Floor Tactical Selection Ring
      const contactMat = new THREE.MeshBasicMaterial({
        map: this.contactShadowTex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      this.vaultDynamicMats.push(contactMat);
      const shadowDisc = new THREE.Mesh(shadowDiscGeo, contactMat);
      shadowDisc.position.set(0, 0.015, 0.55);
      root.add(shadowDisc);

      const floorRingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(vault.accentHex),
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      });
      const floorRing = new THREE.Mesh(floorRingGeo, floorRingMat);
      floorRing.position.set(0, 0.025, 1.35);
      root.add(floorRing);

      // 9. Decoy Hologram Beacon (visible only when decoy planted on this vault)
      const decoyGroup = new THREE.Group();
      decoyGroup.position.set(0, 0.85, 1.35);
      const decoyMesh = new THREE.Mesh(decoyGeo, decoyMat);
      decoyGroup.add(decoyMesh);
      decoyGroup.visible = false;
      root.add(decoyGroup);

      // 10. Dedicated Invisible Raycast Hitbox
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      this.vaultDynamicMats.push(hitboxMat);
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.set(0, 2.1, 0.35);
      hitbox.userData.vaultIndex = idx;
      root.add(hitbox);
      this.interactables.push(hitbox);

      this.vaultsRoot.add(root);

      this.vaultAssemblies.push({
        index: idx,
        root,
        doorPivot,
        wheel,
        bolts,
        gaugeNeedle: needlePivot,
        beaconMat,
        beaconLight: null,
        floorRingMat,
        decoyGroup,
        bullionGroup,
        hitbox,
        plaqueTexture: plaqueTex,
        worldPos: new THREE.Vector3(x, 1.8, z),
        doorAngle: 0,
        targetDoorAngle: 0,
        doorBlowOffsetZ: 0,
        doorBlowTiltX: 0,
        wheelSpeed: 0,
        needleAngle: 2.1,
      });
    });

    this.state.vaults = vaults;
  }

  private clearParticles(): void {
    this.cameraTrauma = 0;
    _mat4.makeScale(0, 0, 0);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (p) p.active = false;
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  public syncState(next: VaultSceneState): void {
    const prevGamePhase = this.state.gamePhase;
    const prevPhase = this.state.roundPhase;
    const prevExplodedCount = this.state.explodedIndices.length;

    if (next.vaults !== this.state.vaults) {
      this.setVaults(next.vaults);
    }

    this.state = next;

    // Trigger juicy physical explosions & bullion bursts on reveal transition
    if (
      next.gamePhase === 'playing' &&
      next.roundPhase === 'revealing' &&
      (prevPhase !== 'revealing' || prevExplodedCount !== next.explodedIndices.length)
    ) {
      for (const expIdx of next.explodedIndices) {
        const asm = this.vaultAssemblies[expIdx];
        if (asm) {
          this.spawnExplosionParticles(asm.worldPos);
        }
      }
      if (next.explodedIndices.length > 0) {
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.78);
      }
      if (next.playerSafeIndex !== null) {
        const safeAsm = this.vaultAssemblies[next.playerSafeIndex];
        if (safeAsm) {
          this.spawnGoldParticles(safeAsm.worldPos);
        }
      }
    }

    // Reset door blows & clear lingering debris when returning to Title or starting a fresh selection
    if (
      (next.gamePhase === 'title' && prevGamePhase !== 'title') ||
      (next.roundPhase === 'selecting' && prevPhase !== 'selecting')
    ) {
      this.clearParticles();
      for (const asm of this.vaultAssemblies) {
        asm.doorAngle = 0;
        asm.targetDoorAngle = 0;
        asm.doorBlowOffsetZ = 0;
        asm.doorBlowTiltX = 0;
        asm.doorPivot.position.set(-0.95, 1.52, 0.18);
        asm.doorPivot.rotation.set(0, 0, 0);
      }
    }
  }

  private spawnExplosionParticles(origin: THREE.Vector3): void {
    const colors: readonly number[] = [0xff4d2e, 0xf97316, 0xfacc15, 0x475569];
    for (let i = 0; i < 36; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_COUNT;
      if (!p) continue;
      p.active = true;
      p.pos.set(
        origin.x + (Math.random() - 0.5) * 1.4,
        origin.y + (Math.random() - 0.3) * 1.6,
        origin.z + 0.45
      );
      p.vel.set(
        (Math.random() - 0.5) * 8.5,
        2.6 + Math.random() * 6.5,
        3.5 + Math.random() * 7.5
      );
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      p.scale = 0.7 + Math.random() * 1.1;
      p.life = 0;
      p.maxLife = 0.85 + Math.random() * 0.7;
      p.color.setHex(colors[i % colors.length] ?? 0xff4d2e);
    }
  }

  private spawnGoldParticles(origin: THREE.Vector3): void {
    const colors: readonly number[] = [0xfbbf24, 0xf59e0b, 0xfef08a];
    for (let i = 0; i < 30; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_COUNT;
      if (!p) continue;
      p.active = true;
      p.pos.set(
        origin.x + (Math.random() - 0.5) * 1.0,
        origin.y - 0.4 + Math.random() * 1.2,
        origin.z + 0.3
      );
      p.vel.set(
        (Math.random() - 0.5) * 4.5,
        3.2 + Math.random() * 4.2,
        2.4 + Math.random() * 4.2
      );
      p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.rotVel.set(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9
      );
      p.scale = 0.9 + Math.random() * 0.55;
      p.life = 0;
      p.maxLife = 1.1 + Math.random() * 0.65;
      p.color.setHex(colors[i % colors.length] ?? 0xfbbf24);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastRaycastMs < 40) return;
    this.lastRaycastMs = now;

    if (this.state.gamePhase !== 'playing' || this.state.roundPhase !== 'selecting') {
      if (this.currentHoverIndex !== null) {
        this.currentHoverIndex = null;
        this.renderer.domElement.style.cursor = 'default';
        this.onHoverChange(null);
      }
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    const firstHit = hits[0];
    const nextHover = firstHit ? (firstHit.object.userData.vaultIndex as number) : null;

    if (nextHover !== this.currentHoverIndex) {
      this.currentHoverIndex = nextHover;
      this.renderer.domElement.style.cursor = nextHover !== null ? 'pointer' : 'default';
      this.onHoverChange(nextHover);
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.state.gamePhase !== 'playing' || this.state.roundPhase !== 'selecting') return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    const firstHit = hits[0];
    if (firstHit) {
      const idx = firstHit.object.userData.vaultIndex as number;
      this.onVaultClick(idx);
    }
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? Math.min(62, 42 + (1 - aspect) * 38) : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = aspect < 1 ? 0.013 : 0.022;
    }
  }

  private updateScene(dt: number): void {
    this.elapsed += dt;

    // 1. Aspect-aware camera framing choreography (guarantees all 3–5 vaults fit on desktop & portrait mobile)
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const isPortrait = aspect < 0.95;
    const isThreeVaults = this.state.vaults.length === 3;
    const halfSpan = isThreeVaults ? (isPortrait ? 5.9 : 5.15) : (isPortrait ? 9.6 : 8.15);
    const tanHalfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * aspect;
    const fitDistZ = halfSpan / Math.max(0.18, tanHalfH) - 4.15;

    if (this.state.gamePhase === 'title') {
      // Slow sweeping showcase tour framing the 5 vaults cleanly above the Title card
      const swayAmp = isPortrait ? 1.4 : 2.6;
      const swayX = Math.sin(this.elapsed * 0.28) * swayAmp;
      const baseZ = Math.max(10.0, fitDistZ + 0.5);
      const swayZ = baseZ + Math.cos(this.elapsed * 0.22) * 0.6;
      this.camPosTarget.set(swayX, isPortrait ? 6.4 : 5.4, swayZ);
      this.camLookTarget.set(swayX * 0.18, isPortrait ? 1.15 : 0.65, -4.6);
    } else if (this.state.roundPhase === 'revealing' && this.state.selectedIndex !== null) {
      const chosen = this.vaultAssemblies[this.state.selectedIndex];
      const focusX = chosen ? chosen.worldPos.x * (isPortrait ? 0.2 : 0.35) : 0;
      const revealZ = Math.max(isThreeVaults ? 9.2 : 9.8, fitDistZ);
      this.camPosTarget.set(focusX, isPortrait ? 6.4 : 5.5, revealZ);
      this.camLookTarget.set(focusX * 0.72, isPortrait ? 1.7 : 2.1, -4.8);
    } else {
      // Tactical elevated overview showing all 3–5 vaults clearly above bottom dock
      const desktopDist = isThreeVaults ? 9.6 : 11.4;
      const dist = Math.max(desktopDist, fitDistZ + 0.8);
      const camHeight = isPortrait ? 6.5 : 5.8;
      this.camPosTarget.set(0, camHeight, dist);
      this.camLookTarget.set(0, isPortrait ? 1.55 : 1.95, -4.8);
    }

    const camLambda = 4.5;
    this.camPosCurrent.x = THREE.MathUtils.damp(this.camPosCurrent.x, this.camPosTarget.x, camLambda, dt);
    this.camPosCurrent.y = THREE.MathUtils.damp(this.camPosCurrent.y, this.camPosTarget.y, camLambda, dt);
    this.camPosCurrent.z = THREE.MathUtils.damp(this.camPosCurrent.z, this.camPosTarget.z, camLambda, dt);

    this.camLookCurrent.x = THREE.MathUtils.damp(this.camLookCurrent.x, this.camLookTarget.x, camLambda, dt);
    this.camLookCurrent.y = THREE.MathUtils.damp(this.camLookCurrent.y, this.camLookTarget.y, camLambda, dt);
    this.camLookCurrent.z = THREE.MathUtils.damp(this.camLookCurrent.z, this.camLookTarget.z, camLambda, dt);

    // Trauma-squared impact shake on explosions
    if (this.cameraTrauma > 0) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.45);
    }
    const shake = this.cameraTrauma * this.cameraTrauma;
    const shakeX = shake * Math.sin(this.elapsed * 57) * 0.42;
    const shakeY = shake * Math.cos(this.elapsed * 49) * 0.34;

    this.camera.position.set(
      this.camPosCurrent.x + shakeX,
      this.camPosCurrent.y + shakeY,
      this.camPosCurrent.z
    );
    this.camera.lookAt(this.camLookCurrent);

    // 2. Animate each 3D Vault Assembly
    for (const asm of this.vaultAssemblies) {
      const idx = asm.index;
      const isSelected = this.state.selectedIndex === idx;
      const isHovered = this.state.hoveredIndex === idx;
      const isDecoy = this.state.decoyIndex === idx;
      const isExploded =
        this.state.roundPhase === 'revealing' && this.state.explodedIndices.includes(idx);
      const isStealJammed =
        this.state.roundPhase === 'revealing' && this.state.stealBustedIndex === idx;
      const isSafeOpen =
        this.state.roundPhase === 'revealing' && !isExploded && !isStealJammed;
      const pressure = this.state.pressures[idx] ?? 0.2;

      // Wheel rotation speed
      const targetWheelSpeed =
        this.state.roundPhase === 'locking' && isSelected
          ? 9.5
          : isSelected
            ? 2.2
            : isHovered
              ? 1.4
              : 0.15;
      asm.wheelSpeed = THREE.MathUtils.damp(asm.wheelSpeed, targetWheelSpeed, 6, dt);
      asm.wheel.rotation.z -= asm.wheelSpeed * dt;

      // Pressure gauge needle sweep (+2.1 rad low -> -2.1 rad redline)
      const jitter = Math.sin(this.elapsed * 7 + idx * 1.7) * 0.08 * pressure;
      const targetNeedle = THREE.MathUtils.lerp(2.05, -2.05, Math.min(1, pressure)) + jitter;
      asm.needleAngle = THREE.MathUtils.damp(asm.needleAngle, targetNeedle, 6, dt);
      asm.gaugeNeedle.rotation.z = asm.needleAngle;

      // Door opening / detonation kinematics
      if (isExploded) {
        asm.targetDoorAngle = -1.75;
        asm.doorBlowOffsetZ = THREE.MathUtils.damp(asm.doorBlowOffsetZ, 0.92, 9, dt);
        asm.doorBlowTiltX = THREE.MathUtils.damp(asm.doorBlowTiltX, 0.38, 8, dt);
      } else if (isSafeOpen) {
        asm.targetDoorAngle = isSelected ? -1.45 : -0.78;
        asm.doorBlowOffsetZ = THREE.MathUtils.damp(asm.doorBlowOffsetZ, 0, 8, dt);
        asm.doorBlowTiltX = THREE.MathUtils.damp(asm.doorBlowTiltX, 0, 8, dt);
      } else {
        asm.targetDoorAngle = 0;
        asm.doorBlowOffsetZ = THREE.MathUtils.damp(asm.doorBlowOffsetZ, 0, 8, dt);
        asm.doorBlowTiltX = THREE.MathUtils.damp(asm.doorBlowTiltX, 0, 8, dt);
      }

      asm.doorAngle = THREE.MathUtils.damp(asm.doorAngle, asm.targetDoorAngle, 6.5, dt);
      asm.doorPivot.rotation.y = asm.doorAngle;
      asm.doorPivot.rotation.x = asm.doorBlowTiltX;
      asm.doorPivot.position.z = 0.18 + asm.doorBlowOffsetZ;

      // Locking bolts slide inward when unlocked (stay jammed outward on steal clash)
      const targetBoltX = isSafeOpen ? 1.72 : 1.92;
      for (const bolt of asm.bolts) {
        bolt.position.x = THREE.MathUtils.damp(bolt.position.x, targetBoltX, 10, dt);
      }

      // Klaxon Beacon glow
      if (isExploded || isStealJammed) {
        const flash = 0.65 + 0.35 * Math.sin(this.elapsed * 18 + idx);
        asm.beaconMat.color.setHex(0xe63946);
        asm.beaconMat.emissive.setHex(0xe63946);
        asm.beaconMat.emissiveIntensity = 2.4 * flash;
      } else if (isSafeOpen && isSelected) {
        asm.beaconMat.color.setHex(0x22c55e);
        asm.beaconMat.emissive.setHex(0x22c55e);
        asm.beaconMat.emissiveIntensity = 1.8;
      } else if (isSelected) {
        asm.beaconMat.color.setHex(0xf59e0b);
        asm.beaconMat.emissive.setHex(0xf59e0b);
        asm.beaconMat.emissiveIntensity = 1.3;
      } else if (pressure > 0.72) {
        asm.beaconMat.color.setHex(0xe63946);
        asm.beaconMat.emissive.setHex(0xe63946);
        asm.beaconMat.emissiveIntensity = 0.75;
      } else {
        asm.beaconMat.color.setHex(0x3b444f);
        asm.beaconMat.emissive.setHex(0x000000);
        asm.beaconMat.emissiveIntensity = 0;
      }

      // Floor ring highlight
      if (isExploded || isStealJammed) {
        asm.floorRingMat.color.setHex(0xe63946);
        asm.floorRingMat.opacity = 0.85;
      } else if (isSelected) {
        asm.floorRingMat.color.setHex(0xfbbf24);
        asm.floorRingMat.opacity = 0.92;
      } else if (isHovered) {
        asm.floorRingMat.color.setHex(0xf8fafc);
        asm.floorRingMat.opacity = 0.65;
      } else {
        asm.floorRingMat.color.set(this.state.vaults[idx]?.accentHex ?? '#94a3b8');
        asm.floorRingMat.opacity = 0.22 + pressure * 0.25;
      }

      // Decoy hologram spin (vanishes once the decoy vault detonates)
      const showDecoy = isDecoy && !isExploded;
      asm.decoyGroup.visible = showDecoy;
      if (showDecoy) {
        asm.decoyGroup.rotation.y = this.elapsed * 2.8;
        asm.decoyGroup.position.y = 0.82 + Math.sin(this.elapsed * 4.2) * 0.14;
      }
    }

    // 3. Update pooled particles (zero GC)
    let anyParticleActive = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (!p || !p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        anyParticleActive = true;
        continue;
      }

      anyParticleActive = true;
      p.vel.y -= 13.5 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.08) {
        p.pos.y = 0.08;
        p.vel.y *= -0.42;
        p.vel.x *= 0.76;
        p.vel.z *= 0.76;
      }

      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;

      const fade = 1 - p.life / p.maxLife;
      const s = p.scale * Math.min(1, fade * 2.2);
      _quat.setFromEuler(p.rot);
      _scaleVec.set(s, s, s);
      _mat4.compose(p.pos, _quat, _scaleVec);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }

    if (anyParticleActive) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (sync && state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    try {
      if (this.state.gamePhase !== 'paused') {
        this.updateScene(dt);
      }
      this.renderer.render(this.scene, this.camera);
    } catch {
      this.onContextLost?.();
      this.dispose();
      return;
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.boundPointerMove);
    el.removeEventListener('pointerdown', this.boundPointerDown);
    el.removeEventListener('webglcontextlost', this.boundContextLost);
    el.removeEventListener('webglcontextrestored', this.boundContextRestored);

    this.clearVaults();
    this.scene.environment = null;
    for (const g of this.sharedGeos) g.dispose();
    for (const m of this.sharedMats) m.dispose();
    for (const t of this.sharedTextures) t.dispose();
    this.renderer.dispose();

    if (el.parentElement === this.container) {
      this.container.removeChild(el);
    }
  }
}

// Keep unused scratch reference silenced cleanly
void _v3;
void _v3b;
