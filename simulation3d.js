import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IESLoader } from 'three/addons/loaders/IESLoader.js';
import IESSpotLight from 'three/addons/lights/IESSpotLight.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// simulation3d.js
// 3D 空間無影燈物理模擬 - 基於 Three.js
console.log("3D Simulation Initialized (with Realistic Mode)");

// ── 行動裝置偵測：降低渲染品質以維持流暢幀率 ──
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768;

const container = document.getElementById('canvas3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a); // 匹配深色主題

// Camera
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
camera.position.set(0, 80, 150);

// Renderer — 行動裝置限制 pixelRatio 最多 2，避免 Retina 造成 3x 渲染負擔
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 2 : 2));
// 陰影：行動裝置用 PCF（較快），桌機用 PCFSoft（較細膩）
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 30, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
// 行動裝置觸控：啟用 touch pan / rotate
controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
};

// Post-Processing (order: Render → SSAO → Bloom → Output)
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// SSAO must come before Bloom to work on clean depth/normal buffers
// 行動裝置：停用 SSAO（環境遮蔽計算耗 GPU，手機易降幀）
const ssaoPass = new SSAOPass(scene, camera, container.clientWidth, container.clientHeight);
ssaoPass.kernelRadius = 16;
ssaoPass.minDistance = 0.005;
ssaoPass.maxDistance = 0.1;
ssaoPass.enabled = !isMobile;  // disabled on mobile for performance
composer.addPass(ssaoPass);

// Reduced bloom: softer glow instead of overexposed flare
const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.85;
bloomPass.strength = isMobile ? 0.25 : 0.35;  // lighter bloom on mobile
bloomPass.radius = 0.8;
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// Window resize handling
window.addEventListener('resize', () => {
    if (!document.getElementById('view-3d').classList.contains('active')) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    composer.setSize(container.clientWidth, container.clientHeight);
});

// Tab switch event
document.querySelector('.view-tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }
});

// --- Mathematical / Abstract Objects ---
const abstractGroup = new THREE.Group();
scene.add(abstractGroup);

const domeRadius = 23; // Realistic MI-1000 diameter is 18" (45.72 cm), radius ~23 cm
const lightColor = 0xfff1e0; // 4300K Color Temperature
const numLights = 12; // M4 GPU optimization limit (16 texture units max for WebGL shadow maps)
const planeSize = 60;

// Heatmap Plane
const heatmapCanvas = document.createElement('canvas');
heatmapCanvas.width = 128;
heatmapCanvas.height = 128;
const heatmapCtx = heatmapCanvas.getContext('2d');
const heatmapTexture = new THREE.CanvasTexture(heatmapCanvas);
heatmapTexture.magFilter = THREE.LinearFilter;
heatmapTexture.minFilter = THREE.LinearFilter;

const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
planeGeo.rotateX(-Math.PI / 2);
const planeMat = new THREE.MeshBasicMaterial({ map: heatmapTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
const plane = new THREE.Mesh(planeGeo, planeMat);
abstractGroup.add(plane);

// Grid Helper
const gridHelper = new THREE.GridHelper(100, 10, 0x334155, 0x1e293b);
abstractGroup.add(gridHelper);

// Ray Lines
let ledPoints = [];
let rayLines = new THREE.LineSegments();
abstractGroup.add(rayLines);


// --- Shared Objects (Obstacle) ---
// Obstacle (Doctor's Head)
const obstacleGeo = new THREE.SphereGeometry(1, 32, 32);
// 預設為數學網格
const obstacleMatWireframe = new THREE.MeshBasicMaterial({ color: 0x475569, wireframe: true, transparent: true, opacity: 0.6 });
// 真實模式的實體材質
const obstacleMatSolid = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.7 });
const obstacle = new THREE.Mesh(obstacleGeo, obstacleMatWireframe);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);


// IBL: RoomEnvironment (procedural, no external HDR file needed — works on GitHub Pages)
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
const envTexture = pmremGenerator.fromScene(roomEnv).texture;
roomEnv.dispose();
pmremGenerator.dispose();

// --- Realistic Environment Objects ---
const realisticGroup = new THREE.Group();
realisticGroup.visible = false;
scene.add(realisticGroup);

// Hemisphere light simulates white ceiling + cool floor bounce (replaces flat AmbientLight)
const hemiLight = new THREE.HemisphereLight(0xfff5e0, 0xd0e8f5, 0.4);
realisticGroup.add(hemiLight);

// Solid Floor (Receives shadow) - Medical Tile Floor
const floorGeo = new THREE.PlaneGeometry(300, 300);
floorGeo.rotateX(-Math.PI / 2);
const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xb0bec5, roughness: 0.25, metalness: 0.05,
    clearcoat: 0.5, clearcoatRoughness: 0.15  // polished tile gloss
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.y = -60;
floor.receiveShadow = true;
realisticGroup.add(floor);

// Operating Table (Stainless Steel Base + Mattress)
const tableGroup = new THREE.Group();
const tableBaseGeo = new THREE.BoxGeometry(20, 40, 40);
const tableMetalMat = new THREE.MeshPhysicalMaterial({
    color: 0x8faab8, roughness: 0.15, metalness: 0.9,
    clearcoat: 1.0, clearcoatRoughness: 0.1  // brushed stainless steel
});
const tableBase = new THREE.Mesh(tableBaseGeo, tableMetalMat);
tableBase.position.set(0, -40, 0);
tableBase.castShadow = true;
tableGroup.add(tableBase);

const tableBedGeo = new THREE.BoxGeometry(40, 4, 120);
const tableBed = new THREE.Mesh(tableBedGeo, tableMetalMat);
tableBed.position.set(0, -18, 0);
tableBed.castShadow = true;
tableBed.receiveShadow = true;
tableGroup.add(tableBed);
realisticGroup.add(tableGroup);

// Patient (Surgical Drape over body)
const patientGroup = new THREE.Group();
const drapeGeo = new THREE.BoxGeometry(36, 12, 100);
const drapeMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f766e, roughness: 0.85,
    sheen: 1.0, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x2dd4bf)  // surgical fabric sheen
});
const patientDrape = new THREE.Mesh(drapeGeo, drapeMat);
patientDrape.position.set(0, -10, -5); // Top of drape is around Y=-4
patientDrape.castShadow = true;
patientDrape.receiveShadow = true;
patientGroup.add(patientDrape);

// Surgical Wound (Visual focal point)
const woundGeo = new THREE.CylinderGeometry(3, 3, 0.5, 32);
const woundMat = new THREE.MeshPhysicalMaterial({
    color: 0x7f1d1d, roughness: 0.3, metalness: 0.05,
    clearcoat: 0.8, clearcoatRoughness: 0.1  // wet tissue specular
});
const wound = new THREE.Mesh(woundGeo, woundMat);
wound.position.set(0, -3.8, 0); // slightly above the drape
wound.receiveShadow = true;
patientGroup.add(wound);

const patientHeadGeo = new THREE.SphereGeometry(6, 32, 32);
const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5a882, roughness: 0.65,
    transmission: 0.08, thickness: 4.0,           // subsurface scattering approximation
    attenuationColor: new THREE.Color(0xff6060), attenuationDistance: 6.0
});
const patientHead = new THREE.Mesh(patientHeadGeo, skinMat);
patientHead.position.set(0, -8, 55); // Head at the top of the bed
patientHead.castShadow = true;
patientHead.receiveShadow = true;
patientGroup.add(patientHead);
realisticGroup.add(patientGroup);

// Doctor Body (Torso and Shoulders attached to Obstacle visually)
const doctorGroup = new THREE.Group();
const scrubMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.9 }); // Blue Scrubs
const torsoGeo = new THREE.BoxGeometry(20, 24, 12);
const torso = new THREE.Mesh(torsoGeo, scrubMat);
torso.position.y = -18;
torso.castShadow = true;
torso.receiveShadow = true;
doctorGroup.add(torso);
const shoulderGeo = new THREE.CylinderGeometry(6, 6, 24, 16);
shoulderGeo.rotateZ(Math.PI / 2);
const shoulders = new THREE.Mesh(shoulderGeo, scrubMat);
shoulders.position.y = -8;
shoulders.castShadow = true;
shoulders.receiveShadow = true;
doctorGroup.add(shoulders);
realisticGroup.add(doctorGroup);

// --- Solid Dome Housing (MI-1000 Exact Specifications) ---
// Diameter: 18" (45.7 cm), Height: 3" (7.6 cm)
const lampGroup = new THREE.Group();
lampGroup.position.y = 100; // Exactly 1 meter focal length to the surgical site (Y=0)

// Main Dome Housing (UFO shape matching 18"x3" specs)
const housingGeo = new THREE.SphereGeometry(domeRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.5);
const housingMat = new THREE.MeshPhysicalMaterial({
    color: 0xf0f4f8, roughness: 0.25, metalness: 0.4,
    clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide  // painted metal housing
});
const housing = new THREE.Mesh(housingGeo, housingMat);
housing.rotateX(Math.PI);
housing.scale.set(1, 0.33, 1); // Compress height to exactly 3" (7.6 cm)
lampGroup.add(housing);

// Central Sterile Handle
const handleGeo = new THREE.CylinderGeometry(2.5, 2.5, 12, 16);
const handleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.2 });
const handle = new THREE.Mesh(handleGeo, handleMat);
handle.position.y = -8; // Protrude downwards from center
lampGroup.add(handle);

// Emissive Lens Panel
const lensGeo = new THREE.CylinderGeometry(domeRadius - 0.5, domeRadius - 0.5, 0.5, 32);
const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: lightColor, emissiveIntensity: 0.2, transparent: true, opacity: 0.6 });
const lensPanel = new THREE.Mesh(lensGeo, lensMat);
lensPanel.position.y = -2;
lampGroup.add(lensPanel);

// Central Camera Module
const cameraModGeo = new THREE.CylinderGeometry(3.5, 3.5, 2, 16);
const cameraModMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2 });
const cameraMod = new THREE.Mesh(cameraModGeo, cameraModMat);
cameraMod.position.y = -3;
lampGroup.add(cameraMod);

// Top Suspension Mount (Yoke Interface)
const yokeGeo = new THREE.BoxGeometry(domeRadius * 2.2, 4, 8);
const yokeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.5 });
const yoke = new THREE.Mesh(yokeGeo, yokeMat);
yoke.position.y = 14;
lampGroup.add(yoke);

// Spring Arm (Horizontal segment)
const springArmGeo = new THREE.BoxGeometry(4, 8, 80);
const springArm = new THREE.Mesh(springArmGeo, yokeMat);
springArm.position.set(0, 24, -40); // Extends backward
lampGroup.add(springArm);

// Ceiling Pole & Mount Base
const poleGeo = new THREE.CylinderGeometry(4, 4, 80, 16);
const pole = new THREE.Mesh(poleGeo, yokeMat);
pole.position.set(0, 64, -80); // Connects to the back of the spring arm
lampGroup.add(pole);

const ceilingMountGeo = new THREE.CylinderGeometry(15, 15, 5, 32);
const ceilingMount = new THREE.Mesh(ceilingMountGeo, yokeMat);
ceilingMount.position.set(0, 104, -80);
lampGroup.add(ceilingMount);

realisticGroup.add(lampGroup);

// Auxiliary Lamp (Satellite Dome)
const auxLampGroup = lampGroup.clone();
auxLampGroup.scale.set(0.7, 0.7, 0.7); // 70% size
auxLampGroup.position.set(-60, 90, 40); // Offset to the side
realisticGroup.add(auxLampGroup);

// Operating Room Walls & Ceiling
const roomMat = new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.9, metalness: 0.0, side: THREE.BackSide });
const roomGeo = new THREE.BoxGeometry(260, 220, 260);
const room = new THREE.Mesh(roomGeo, roomMat);
room.position.y = 50; // center room so ceiling is above lamp
room.receiveShadow = true;
realisticGroup.add(room);

// Medical Equipment (Monitor / Endoscopy cart)
const equipmentGroup = new THREE.Group();
const cartMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
const cartBase = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), cartMat);
cartBase.position.y = -59;
equipmentGroup.add(cartBase);
const cartPole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 16), cartMat);
cartPole.position.y = -39;
equipmentGroup.add(cartPole);
const monitorMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
const monitorScreen = new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x0284c7, emissiveIntensity: 0.5 });
const monitor = new THREE.Mesh(new THREE.BoxGeometry(2, 12, 20), monitorMat);
monitor.position.set(2, -19, 0);
equipmentGroup.add(monitor);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), monitorScreen);
screen.rotation.y = Math.PI / 2;
screen.position.set(3.1, -19, 0);
equipmentGroup.add(screen);
equipmentGroup.position.set(-40, 0, 40);
equipmentGroup.rotation.y = Math.PI / 4;
realisticGroup.add(equipmentGroup);

// SpotLights (to simulate LED shadows in realistic mode)
// Hardware Check: Apple M4 10-Core GPU has massive compute power, but WebGL fragment shaders
// are still capped at 16 TEXTURE_IMAGE_UNITS by browser standard. We use 12 lights max.
const spotLights = [];
const volumetricCones = [];
const numSpotLights = 12;

// Volumetric Cone Geometry (Tip at origin, extending along +Z)
const coneGeo = new THREE.ConeGeometry(10.5, 120, 16);
coneGeo.translate(0, -60, 0); 
coneGeo.rotateX(Math.PI / 2);

// Load IES Profile
const iesLoader = new IESLoader();
let iesTexture = null;
iesLoader.load('LDP0109501.ies', (texture) => {
    iesTexture = texture;
    spotLights.forEach(light => {
        light.iesMap = iesTexture;
    });
});

for(let i=0; i<numSpotLights; i++) {
    const light = new IESSpotLight(lightColor, 50000); // Increased for r160 physical lights
    if (iesTexture) light.iesMap = iesTexture;
    // Physical configuration based on MI-1000 and Asahi Optics principles
    // To get ~20.9cm light field diameter at 1 meter, the angle should be roughly Math.atan(10.45 / 100) = ~0.104 rad
    // But since the lights are offset on a 15cm radius and point inward, the cone needs to be slightly wider to overlap perfectly.
    light.angle = 0.15; // Fine-tuned for precise 8.3" diameter overlap at 1m
    light.penumbra = 1.0; // 100% penumbra for ultimate shadow dilution (soft edge)
    light.decay = 2.0; // Physically correct inverse square falloff
    light.distance = 0; // Physically correct infinite distance

    // High fidelity shadow map for M4 hardware
    light.castShadow = true;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 20;
    light.shadow.camera.far = 180;
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;  // eliminates surface self-shadowing acne
    light.shadow.radius = 4;
    
    realisticGroup.add(light);
    spotLights.push(light);

    // Add Volumetric Light Cone
    const coneMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        blending: THREE.AdditiveBlending, 
        opacity: 0.0,
        depthWrite: false
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    realisticGroup.add(cone);
    volumetricCones.push(cone);
}

// State for smooth lerp animation
const target3D = {
    lampY: 100,
    obsScale: 10.5,
    obsPos: new THREE.Vector3(0, 50, 0),
    lights: new Array(numSpotLights).fill(null).map(() => ({
        intensity: 0.5,
        position: new THREE.Vector3(0, 100, 0)
    }))
};

// UI Elements
const uiElements3D = {
    lampHeight: document.getElementById('lamp_height'),
    obsX: document.getElementById('obstacle_x'),
    ledCount: document.getElementById('num_leds'),
    domeAngle: document.getElementById('beam_spread'),
    obsY: document.getElementById('obstacle_y'),
    obsZ: document.getElementById('obstacle_z'),
    obsRad: document.getElementById('obstacle_rad'),
    realisticMode: document.getElementById('realistic_mode'),
    smartComp: document.getElementById('smart_compensation'),
    smartCompGroup: document.getElementById('smart_comp_group')
};

function getParams3D() {
    return {
        lampHeight: parseFloat(uiElements3D.lampHeight.value),
        ledCount: parseInt(uiElements3D.ledCount.value),
        maxAngle: parseFloat(uiElements3D.domeAngle.value) * Math.PI / 180,
        obsX: parseFloat(uiElements3D.obsX.value),
        obsY: parseFloat(uiElements3D.obsY.value),
        obsZ: parseFloat(uiElements3D.obsZ.value),
        obsRad: parseFloat(uiElements3D.obsRad.value),
        isRealistic: uiElements3D.realisticMode && uiElements3D.realisticMode.checked,
        smartCompEnabled: uiElements3D.smartComp && uiElements3D.smartComp.checked
    };
}

// Generate uniform points on a spherical cap
function generateLEDs3D(count, radius, maxAngle, lampHeight) {
    const points = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); 
    for (let i = 0; i < count; i++) {
        let y = 1 - (i / (count - 1)) * (1 - Math.cos(maxAngle));
        if (isNaN(y)) y = 1;
        const r = Math.sqrt(1 - y * y);
        const theta = phi * i;
        const px = Math.cos(theta) * r * radius;
        const pz = Math.sin(theta) * r * radius;
        const py = y * radius;
        points.push(new THREE.Vector3(px, lampHeight - (radius - py), pz));
    }
    return points;
}

let timeoutId = null;

function updateSimulation3D(fullHeatmap = true) {
    if (!document.getElementById('view-3d').classList.contains('active')) return;
    
    const params = getParams3D();
    
    // Handle Mode Toggle
    if (params.isRealistic) {
        abstractGroup.visible = false;
        realisticGroup.visible = true;
        obstacle.material = obstacleMatSolid;
        scene.background = new THREE.Color(0x1a2233);
        scene.environment = envTexture;        // IBL for PBR reflections
        renderer.toneMappingExposure = 0.85;
        if (uiElements3D.smartCompGroup) uiElements3D.smartCompGroup.style.display = 'block';
    } else {
        abstractGroup.visible = true;
        realisticGroup.visible = false;
        obstacle.material = obstacleMatWireframe;
        scene.background = new THREE.Color(0x0f172a);
        scene.environment = null;
        renderer.toneMappingExposure = 1.0;
        if (uiElements3D.smartCompGroup) uiElements3D.smartCompGroup.style.display = 'none';
    }
    
    // Update Target State for Lerp
    target3D.lampY = params.lampHeight;
    target3D.obsScale = params.obsRad;
    target3D.obsPos.set(params.obsX, params.obsY, params.obsZ);

    // Generate LEDs
    ledPoints = generateLEDs3D(params.ledCount, domeRadius, params.maxAngle, params.lampHeight);

    // If Realistic, update SpotLights positions to match the dome spread
    if (params.isRealistic) {
        // Place spot lights in two concentric rings
        const outerAngle = params.maxAngle * 0.9;
        const innerAngle = params.maxAngle * 0.4;
        
        let blockedCount = 0;
        const baseIntensity = ((params.ledCount / 50) * 0.6 + 0.2) * 50000; // Scaled for r160 physical lighting
        const lightBlockedStatus = new Array(numSpotLights).fill(false);

        // Smart Compensation Raycasting Setup
        const targetPt = new THREE.Vector3(0, 0, 0); // Wound center
        const sphere = new THREE.Sphere(obstacle.position, params.obsRad);
        const ray = new THREE.Ray();
        
        for (let i = 0; i < numSpotLights; i++) {
            let ringAngle, theta;
            if (i < 4) {
                // Inner ring (4 lights)
                ringAngle = innerAngle;
                theta = (i / 4) * Math.PI * 2;
            } else {
                // Outer ring (8 lights)
                ringAngle = outerAngle;
                theta = ((i - 4) / 8) * Math.PI * 2;
            }

            const px = Math.sin(ringAngle) * Math.cos(theta) * domeRadius;
            const pz = Math.sin(ringAngle) * Math.sin(theta) * domeRadius;
            const py = Math.cos(ringAngle) * domeRadius;
            
            const lightPos = new THREE.Vector3(px, params.lampHeight - (domeRadius - py), pz);
            target3D.lights[i].position.copy(lightPos);
            spotLights[i].target = floor;
            
            if (params.smartCompEnabled) {
                const dir = new THREE.Vector3().subVectors(targetPt, lightPos).normalize();
                ray.set(lightPos, dir);
                const intersect = ray.intersectSphere(sphere, new THREE.Vector3());
                // If intersection distance is less than distance to wound, it is blocked
                if (intersect && lightPos.distanceTo(intersect) < lightPos.distanceTo(targetPt)) {
                    lightBlockedStatus[i] = true;
                    blockedCount++;
                }
            }
        }
        
        // Apply Smart Compensation Target Intensity
        for (let i = 0; i < numSpotLights; i++) {
            if (params.smartCompEnabled) {
                if (lightBlockedStatus[i]) {
                    target3D.lights[i].intensity = baseIntensity * 0.1; // PWM dimmed
                } else {
                    // Boost unblocked LEDs. Maximum 3x boost to prevent blowing out
                    const boost = blockedCount > 0 ? (blockedCount / (numSpotLights - blockedCount)) * baseIntensity : 0;
                    target3D.lights[i].intensity = Math.min(baseIntensity * 3, baseIntensity + boost);
                }
            } else {
                target3D.lights[i].intensity = baseIntensity;
            }
        }
    }

    // Only draw ray lines and heatmap if Abstract Mode
    if (!params.isRealistic) {
        // Draw Ray Lines
        const lineGeo = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        const colorValid = new THREE.Color(0x2dd4bf); 
        const colorBlocked = new THREE.Color(0xf43f5e); 

        const ray = new THREE.Ray();
        const sphere = new THREE.Sphere(obstacle.position, params.obsRad);
        const targetCenter = new THREE.Vector3(0, 0, 0);

        for (let i = 0; i < ledPoints.length; i++) {
            const start = ledPoints[i];
            const dir = new THREE.Vector3().subVectors(targetCenter, start).normalize();
            ray.set(start, dir);
            
            const distToOrigin = start.distanceTo(targetCenter);
            let end = targetCenter.clone();
            let isBlocked = false;

            const intersect = ray.intersectSphere(sphere, new THREE.Vector3());
            if (intersect) {
                if (start.distanceTo(intersect) < distToOrigin) {
                    isBlocked = true;
                    end = intersect;
                }
            }

            positions.push(start.x, start.y, start.z);
            positions.push(end.x, end.y, end.z);

            const c = isBlocked ? colorBlocked : colorValid;
            colors.push(c.r, c.g, c.b);
            colors.push(c.r, c.g, c.b);
        }

        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        if (rayLines.geometry) rayLines.geometry.dispose();
        rayLines.geometry = lineGeo;
        rayLines.material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3 });

        // Throttle Heatmap Generation
        if (fullHeatmap) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                generateHeatmap(params);
            }, 50);
        }
    }
}

function generateHeatmap(params) {
    const size = heatmapCanvas.width;
    const ctx = heatmapCtx;
    ctx.clearRect(0, 0, size, size);
    
    const planeExtents = planeSize / 2;
    let maxPossibleIntensity = 0;
    
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const sphere = new THREE.Sphere(obstacle.position, params.obsRad);
    const ray = new THREE.Ray();
    const pt = new THREE.Vector3();
    const normal = new THREE.Vector3(0, 1, 0);

    // Calculate max intensity at center without obstacle
    for (let l = 0; l < ledPoints.length; l++) {
        const dir = new THREE.Vector3().subVectors(ledPoints[l], new THREE.Vector3(0,0,0));
        const distSq = dir.lengthSq();
        dir.normalize();
        const cosTheta = dir.dot(normal);
        maxPossibleIntensity += cosTheta / distSq;
    }

    if(maxPossibleIntensity === 0) maxPossibleIntensity = 1;

    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const worldX = (px / (size - 1)) * planeSize - planeExtents;
            const worldZ = (py / (size - 1)) * planeSize - planeExtents;
            pt.set(worldX, 0, worldZ);
            
            let intensity = 0;
            
            for (let l = 0; l < ledPoints.length; l++) {
                const led = ledPoints[l];
                const dir = new THREE.Vector3().subVectors(led, pt);
                const distSq = dir.lengthSq();
                const dist = Math.sqrt(distSq);
                dir.normalize();
                
                ray.set(pt, dir);
                const intersect = ray.intersectSphere(sphere, new THREE.Vector3());
                let blocked = false;
                if (intersect && pt.distanceTo(intersect) < dist) {
                    blocked = true;
                }
                
                if (!blocked) {
                    const cosTheta = dir.dot(normal);
                    if (cosTheta > 0) {
                        intensity += cosTheta / distSq;
                    }
                }
            }
            
            const relIntensity = Math.min(1, intensity / maxPossibleIntensity);
            
            const h = (1.0 - relIntensity) * 240; 
            const rgb = hslToRgb(h / 360, 1, 0.5);
            
            const idx = (py * size + px) * 4;
            data[idx] = rgb[0];
            data[idx+1] = rgb[1];
            data[idx+2] = rgb[2];
            data[idx+3] = 200 + Math.floor(relIntensity * 55);
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
    heatmapTexture.needsUpdate = true;
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s == 0) {
        r = g = b = l; 
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// 隱藏 3D 載入提示（第一幀渲染後）
let _loadingDismissed = false;
function dismissLoading() {
    if (_loadingDismissed) return;
    _loadingDismissed = true;
    const overlay = document.getElementById('canvas3d-loading');
    if (!overlay) return;
    overlay.classList.add('hidden');
    // opacity 過渡結束後移除 DOM 節點（不再佔用渲染層）
    overlay.addEventListener('transitionend', function() {
        overlay.remove();
    }, { once: true });
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Smooth Interpolation (Lerp) for Physical Realism
    const lerpFactor = 0.1;
    
    // Lerp Lamp Housing Height
    lampGroup.position.y += (target3D.lampY - lampGroup.position.y) * lerpFactor;
    auxLampGroup.position.y = lampGroup.position.y - 10;

    // Lerp Obstacle and Doctor
    obstacle.scale.lerp(new THREE.Vector3(target3D.obsScale, target3D.obsScale, target3D.obsScale), lerpFactor);
    obstacle.position.lerp(target3D.obsPos, lerpFactor);
    doctorGroup.position.set(obstacle.position.x, obstacle.position.y - target3D.obsScale, obstacle.position.z);
    
    // Lerp Lights and Volumetric Cones
    for(let i = 0; i < numSpotLights; i++) {
        spotLights[i].intensity += (target3D.lights[i].intensity - spotLights[i].intensity) * lerpFactor;
        spotLights[i].position.lerp(target3D.lights[i].position, lerpFactor);
        
        // Update Volumetric Cones to match SpotLights
        if (volumetricCones[i]) {
            volumetricCones[i].position.copy(spotLights[i].position);
            volumetricCones[i].lookAt(0, 0, 0); // Point towards the center of the surgical field
            // Scale opacity based on current intensity (scaled back down for r160)
            volumetricCones[i].material.opacity = (spotLights[i].intensity / 50000) * 0.05; 
        }
    }

    if (document.getElementById('view-3d').classList.contains('active')) {
        composer.render();
        dismissLoading();  // 第一次成功渲染後隱藏載入提示
    }
}

// Bind UI Events
['input', 'change'].forEach(evt => {
    ['obstacle_x', 'num_leds', 'beam_spread', 'obstacle_y', 'obstacle_z', 'obstacle_rad'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(evt, () => {
                const valId = 'val_' + id;
                const labelElem = document.getElementById(valId);
                if(labelElem) {
                    labelElem.textContent = el.value;
                }
                updateSimulation3D(true);
            });
        }
    });
});

if (uiElements3D.realisticMode) {
    uiElements3D.realisticMode.addEventListener('change', () => {
        updateSimulation3D(true);
    });
}

if (uiElements3D.smartComp) {
    uiElements3D.smartComp.addEventListener('change', () => {
        updateSimulation3D(true);
    });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (document.getElementById('view-3d').classList.contains('active')) {
            updateSimulation3D(true);
        }
    });
});

// Initialize
setTimeout(() => updateSimulation3D(true), 500);
animate();
