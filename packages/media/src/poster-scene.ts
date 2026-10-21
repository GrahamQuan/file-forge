/** Trusted renderer module served only inside FileForge's isolated headless browser. */
export const posterScene = `
import * as THREE from 'three';
import { GLTFLoader } from '/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from '/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from '/examples/jsm/environments/RoomEnvironment.js';

globalThis.fileForgeReady = (async () => {
  const options = __OPTIONS__;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(options.width, options.height);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  document.body.appendChild(renderer.domElement);
  const manager = new THREE.LoadingManager();
  const failures = [];
  renderer.debug.onShaderError = () => failures.push("shader-compilation");
  manager.onError = url => failures.push(url);
  const draco = new DRACOLoader(manager).setDecoderPath('/examples/jsm/libs/draco/gltf/').setWorkerLimit(1);
  const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(await (await fetch('/model.glb')).arrayBuffer(), '');
  if (failures.length) throw new Error('Model resources failed to load');
  const scene = new THREE.Scene();
  const excluded = [];
  gltf.scene.traverse(object => { if (object.isLight || object.isCamera) excluded.push(object); });
  for (const object of excluded) object.removeFromParent();
  scene.add(gltf.scene);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
  if (bounds.isEmpty()) throw new Error('Model has no visible geometry');
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  if (!center.toArray().every(Number.isFinite) || !Number.isFinite(radius) || radius <= 0 || radius > 1e12) throw new Error('Invalid model bounds');
  // Shared bounding sphere preserves scale and framing across all six views, including pole views.
  const aspect = options.width / options.height;
  const halfHeight = radius * 1.1 / Math.min(aspect, 1);
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, radius * 0.01, radius * 10);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  const views = {
    front: [[0, 0, 1], [0, 1, 0]], back: [[0, 0, -1], [0, 1, 0]],
    left: [[-1, 0, 0], [0, 1, 0]], right: [[1, 0, 0], [0, 1, 0]],
    top: [[0, 1, 0], [0, 0, -1]], bottom: [[0, -1, 0], [0, 0, 1]]
  };
  globalThis.fileForgeRender = async view => {
    const [direction, up] = views[view];
    camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction), radius * 3);
    camera.up.set(...up);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    if (failures.length || renderer.getContext().isContextLost()) throw new Error('Rendering failed');
    return { png: renderer.domElement.toDataURL('image/png').split(',')[1], position: camera.position.toArray(), target: center.toArray(), up, orthographicScale: halfHeight * 2 };
  };
  globalThis.fileForgeDispose = () => { draco.dispose(); environmentMap.dispose(); environment.dispose(); pmrem.dispose(); renderer.dispose(); };
  return { threeVersion: THREE.REVISION, pose: 'default-scene', projection: 'orthographic', background: 'transparent', lighting: 'room-environment' };
})();
`;
