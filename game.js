import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- Game Constants & Config ---
const PLAYER_SPEED = 18;
const JUMP_FORCE = 18;
const GRAVITY = 50;
const BULLET_SPEED = 80;

// Weapon Definitions based on GDD
const WEAPONS = {
    1: { name: 'Pistol', damage: 35, cooldown: 350, type: 'projectile', color: 0xffff00, size: 0.2, speed: 100, spread: 0.01, modelColor: 0x555555 },
    2: { name: 'Laser', damage: 12, cooldown: 80, type: 'hitscan', color: 0x00ffff, range: 100, spread: 0.02, modelColor: 0x0000ff },
    3: { name: 'Rocket', damage: 120, cooldown: 1200, type: 'explosive', color: 0xff4400, size: 0.5, speed: 35, blastRadius: 10, modelColor: 0x225522 }
};

// Enemy Definitions based on GDD
const ENEMIES = {
    DRONE: { hp: 40, speed: 10, color: 0xffaa00, score: 50, radius: 0.8, attackRange: 2, damage: 10, attackRate: 1000, type: 'melee' }, // Yellow
    GRUNT: { hp: 100, speed: 4, color: 0xff5500, score: 100, radius: 1.2, attackRange: 30, damage: 15, attackRate: 2000, type: 'ranged' }, // Orange
    MECH:  { hp: 300, speed: 1.5, color: 0xff0044, score: 300, radius: 2.5, attackRange: 50, damage: 40, attackRate: 3000, type: 'heavy' }  // Red
};

// --- Helper Function: Create Health Bar ---
function createHealthBar() {
    const barGroup = new THREE.Group();
    
    // Background (Black border/bg)
    const bgGeo = new THREE.PlaneGeometry(1.2, 0.15);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    barGroup.add(bg);

    // Foreground (Health color)
    const fgGeo = new THREE.PlaneGeometry(1.1, 0.1);
    fgGeo.translate(0.55, 0, 0); // Translate geometry so scaling works from left (0) to right
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const fg = new THREE.Mesh(fgGeo, fgMat);
    fg.position.x = -0.55; // Align left edge
    fg.position.z = 0.02;  // Slightly in front
    
    barGroup.add(fg);
    
    // Store reference to foreground to update scale later
    barGroup.userData = { fg: fg };
    return barGroup;
}

// --- State Variables ---
let camera, scene, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
let prevTime = performance.now();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

let player = { hp: 100, maxHp: 100, score: 0, weapon: 1, lastShot: 0 };
let isGameActive = false;
let isGameOver = false;

let moveSpeedMultiplier = 1.0;

// Entities
let enemies = [];
let playerProjectiles = [];
let enemyProjectiles = [];
let particles = [];
let obstacles = []; // for simple collision logic if needed (mostly floor for now)
let worldGeometry = []; // For raycasting hitscan

let weaponMesh; // Current weapon model holder

// DOM Elements
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const scoreEl = document.getElementById('score');
const hpBar = document.getElementById('hp-bar');
const damageOverlay = document.getElementById('damage-overlay');
const missionStatus = document.getElementById('mission-status');
const hitmarker = document.getElementById('hitmarker');

// Audio Elements
const bgmAudio = document.getElementById('bgm');
const pistolSound = document.getElementById('pistol-sound');
const laserSound = document.getElementById('laser-sound');
const rocketSound = document.getElementById('rocket-sound');
const hurtSound = document.getElementById('hurt-sound');
const footstepSound = document.getElementById('footstep-sound');
const jumpSound = document.getElementById('jump-sound');

// Audio settings
if (bgmAudio) bgmAudio.volume = 0.15;
if (pistolSound) pistolSound.volume = 0.5;
if (laserSound) laserSound.volume = 0.4;
if (rocketSound) rocketSound.volume = 0.6;
if (hurtSound) hurtSound.volume = 0.5;
if (footstepSound) footstepSound.volume = 0.3;
if (jumpSound) jumpSound.volume = 0.4;

// Settings Elements
const sensitivityInput = document.getElementById('sensitivity');
const sensitivityVal = document.getElementById('sens-val');
const moveSpeedInput = document.getElementById('move-speed');
const moveSpeedVal = document.getElementById('move-val');

init();
animate();

function init() {
    // Scene Setup
    scene = new THREE.Scene();
    // Changed background to slightly lighter blue
    scene.background = new THREE.Color(0x111122); 
    // Reduced fog density slightly and matched color
    scene.fog = new THREE.FogExp2(0x111122, 0.012);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 2;

    // Lights - IMPROVED LIGHTING
    // Brighter ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);

    // Added Hemisphere Light for better general visibility (Sky/Ground)
    const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x222233, 0.5);
    scene.add(hemiLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new PointerLockControls(camera, document.body);
    
    // Setup Sensitivity
    controls.pointerSpeed = parseFloat(sensitivityInput.value);
    sensitivityInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        controls.pointerSpeed = val;
        sensitivityVal.innerText = val.toFixed(1);
    });
    
    // Setup Move Speed
    moveSpeedMultiplier = parseFloat(moveSpeedInput.value);
    moveSpeedInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        moveSpeedMultiplier = val;
        moveSpeedVal.innerText = val.toFixed(1);
    });
    
    controls.addEventListener('lock', () => {
        overlay.style.display = 'none';
        isGameActive = true;
        
        // Start background music
        if (bgmAudio) {
            bgmAudio.play().catch(e => console.log('BGM play failed:', e));
        }
    });
    
    controls.addEventListener('unlock', () => {
        if(!isGameOver) {
            overlay.style.display = 'flex';
            startBtn.innerText = "RESUME";
            document.getElementById('title-text').innerHTML = "PAUSED";
            
            // Pause background music and footsteps
            if (bgmAudio) {
                bgmAudio.pause();
            }
            if (footstepSound) {
                footstepSound.pause();
                footstepSound.currentTime = 0;
            }
        }
        isGameActive = false;
    });

    scene.add(controls.getObject());

    // Listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onWindowResize);
    startBtn.addEventListener('click', () => {
        if (isGameOver) resetGame();
        controls.lock();
    });

    // Initial World Generation
    generateLevel();
    updateWeaponModel();
    
    // Enemy Spawner Loop
    setInterval(() => {
        if(isGameActive && enemies.length < 20) spawnEnemy();
    }, 1500);
}

function generateLevel() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(400, 400);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x151520 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    worldGeometry.push(floor);

    // Grid Texture
    const gridHelper = new THREE.GridHelper(400, 100, 0x00ffff, 0x222233);
    scene.add(gridHelper);

    // --- ADDED: Boundary Walls (新增邊界牆) ---
    const limit = 200; // Map radius (400/2)
    const wallHeight = 60;
    const wallThickness = 10;
    
    // Material: Sci-fi Force Field Style
    const wallMat = new THREE.MeshPhongMaterial({ 
        color: 0x0088ff, 
        transparent: true, 
        opacity: 0.15, 
        side: THREE.DoubleSide,
        emissive: 0x002255
    });

    const wallConfigs = [
        { size: [400 + wallThickness * 2, wallHeight, wallThickness], pos: [0, wallHeight/2, -limit - wallThickness/2] }, // North
        { size: [400 + wallThickness * 2, wallHeight, wallThickness], pos: [0, wallHeight/2, limit + wallThickness/2] },  // South
        { size: [wallThickness, wallHeight, 400], pos: [-limit - wallThickness/2, wallHeight/2, 0] }, // West
        { size: [wallThickness, wallHeight, 400], pos: [limit + wallThickness/2, wallHeight/2, 0] }   // East
    ];

    wallConfigs.forEach(config => {
        const geo = new THREE.BoxGeometry(...config.size);
        const wall = new THREE.Mesh(geo, wallMat);
        wall.position.set(...config.pos);
        scene.add(wall);
        
        // Add collision data
        wall.updateMatrixWorld();
        const box = new THREE.Box3().setFromObject(wall);
        wall.userData.box = box;
        obstacles.push(wall); // Add to obstacles array for collision check

        // Add Visual Grid Lines on walls
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00ffff, opacity: 0.4, transparent: true }));
        wall.add(line);
    });
    // ----------------------------------------

    // Obstacles (Low Poly Style)
    const geoms = [
        new THREE.BoxGeometry(1,1,1),
        new THREE.CylinderGeometry(0.5, 0.5, 1, 6)
    ];
    const mat = new THREE.MeshPhongMaterial({ color: 0x444455, flatShading: true });

    for (let i = 0; i < 150; i++) {
        const type = Math.floor(Math.random() * geoms.length);
        const mesh = new THREE.Mesh(geoms[type], mat);
        
        // Random Size
        const sx = Math.random() * 5 + 2;
        const sy = Math.random() * 8 + 2;
        const sz = Math.random() * 5 + 2;
        mesh.scale.set(sx, sy, sz);

        // Random Pos
        const x = (Math.random() - 0.5) * 300;
        const z = (Math.random() - 0.5) * 300;
        
        // Keep spawn clear
        if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;

        mesh.position.set(x, sy/2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Compute Bounding Box for Collision
        // We need to update world matrix first to get correct world bounding box
        mesh.updateMatrixWorld();
        const box = new THREE.Box3().setFromObject(mesh);
        mesh.userData.box = box;
        
        scene.add(mesh);
        worldGeometry.push(mesh);
        obstacles.push(mesh);
    }
}

// --- Collision Check Function ---
function checkPlayerCollision() {
    const playerPos = controls.getObject().position;
    // Create a small bounding box for the player
    const playerBox = new THREE.Box3();
    const min = new THREE.Vector3(playerPos.x - 0.5, playerPos.y - 1.5, playerPos.z - 0.5);
    const max = new THREE.Vector3(playerPos.x + 0.5, playerPos.y + 0.5, playerPos.z + 0.5);
    playerBox.set(min, max);

    for (const obstacle of obstacles) {
        // If the player box overlaps with any obstacle box
        if (obstacle.userData.box && playerBox.intersectsBox(obstacle.userData.box)) {
            return true;
        }
    }
    return false;
}

// --- Weapon System ---

function updateWeaponModel() {
    if (weaponMesh) camera.remove(weaponMesh);
    
    const wData = WEAPONS[player.weapon];
    const mat = new THREE.MeshPhongMaterial({ color: wData.modelColor, flatShading: true });
    
    if (player.weapon === 1) { // Pistol
        const g = new THREE.BoxGeometry(0.15, 0.2, 0.4);
        weaponMesh = new THREE.Mesh(g, mat);
        weaponMesh.position.set(0.4, -0.3, -0.6);
    } else if (player.weapon === 2) { // Laser
        const g = new THREE.CylinderGeometry(0.05, 0.08, 0.8, 8);
        weaponMesh = new THREE.Mesh(g, mat);
        weaponMesh.rotation.x = -Math.PI / 2;
        weaponMesh.position.set(0.4, -0.3, -0.6);
    } else { // Rocket
        const g = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 12);
        weaponMesh = new THREE.Mesh(g, mat);
        weaponMesh.rotation.x = -Math.PI / 2;
        weaponMesh.position.set(0.4, -0.35, -0.5);
    }
    camera.add(weaponMesh);
    
    // UI Update
    document.querySelectorAll('.weapon-slot').forEach(el => el.classList.remove('active'));
    document.getElementById(`slot-${player.weapon}`).classList.add('active');
}

function shoot() {
    const now = performance.now();
    const wData = WEAPONS[player.weapon];
    
    if (now - player.lastShot < wData.cooldown) return;
    player.lastShot = now;

    // Play weapon-specific shoot sound
    let currentWeaponSound = null;
    switch(player.weapon) {
        case 1: // Pistol
            currentWeaponSound = pistolSound;
            break;
        case 2: // Laser
            currentWeaponSound = laserSound;
            break;
        case 3: // Rocket
            currentWeaponSound = rocketSound;
            break;
    }
    
    if (currentWeaponSound) {
        currentWeaponSound.currentTime = 0;
        currentWeaponSound.play().catch(e => console.log('Audio play failed:', e));
    }

    // Recoil
    if (weaponMesh) {
        weaponMesh.position.z += 0.15;
        setTimeout(() => weaponMesh.position.z -= 0.15, 100);
    }

    // Muzzle flash logic (simplified as a light)
    createMuzzleFlash(wData.color);

    if (wData.type === 'hitscan') {
        // Laser logic
        createLaserBeam(wData.color);
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(enemies.map(e => e.mesh)); // Check enemies first
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.distance < wData.range) {
                damageEnemy(hit.object.userData.ref, wData.damage);
                createImpact(hit.point, wData.color);
            }
        } else {
            // Check world
             const worldHits = raycaster.intersectObjects(worldGeometry);
             if (worldHits.length > 0 && worldHits[0].distance < wData.range) {
                 createImpact(worldHits[0].point, wData.color);
             }
        }
    } 
    else if (wData.type === 'projectile' || wData.type === 'explosive') {
        // Projectile Logic
        const geo = new THREE.SphereGeometry(wData.size, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: wData.color });
        const bullet = new THREE.Mesh(geo, mat);
        
        // Spawn position
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        bullet.position.copy(camera.position).add(dir.multiplyScalar(1.5)); // Start slightly in front
        
        bullet.userData = { 
            velocity: dir.multiplyScalar(wData.speed), 
            type: wData.type,
            damage: wData.damage,
            radius: wData.blastRadius,
            active: true
        };
        
        // Add gravity to rockets
        if (wData.type === 'explosive') {
            bullet.userData.gravity = 15;
        }

        scene.add(bullet);
        playerProjectiles.push(bullet);
    }
}

// --- Enemy System ---

function spawnEnemy() {
    // Determine Type
    const rand = Math.random();
    let typeConfig, typeKey;
    
    if (rand < 0.6) { typeConfig = ENEMIES.DRONE; typeKey = 'DRONE'; } // 60% Drones
    else if (rand < 0.9) { typeConfig = ENEMIES.GRUNT; typeKey = 'GRUNT'; } // 30% Grunts
    else { typeConfig = ENEMIES.MECH; typeKey = 'MECH'; } // 10% Mechs

    // Geometry based on type
    let geo, mat;
    if (typeKey === 'DRONE') geo = new THREE.OctahedronGeometry(typeConfig.radius);
    else if (typeKey === 'GRUNT') geo = new THREE.BoxGeometry(1, 2, 1);
    else geo = new THREE.IcosahedronGeometry(typeConfig.radius);

    mat = new THREE.MeshPhongMaterial({ color: typeConfig.color, flatShading: true, emissive: 0x220000 });
    const mesh = new THREE.Mesh(geo, mat);

    // Spawn Position (Distance 30-80 from player)
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 50;
    const px = camera.position.x + Math.cos(angle) * dist;
    const pz = camera.position.z + Math.sin(angle) * dist;
    
    mesh.position.set(px, typeConfig.radius + 1, pz);
    mesh.castShadow = true;

    // --- ADDED: Attach Health Bar ---
    const hpBar = createHealthBar();
    // Adjust height based on enemy size
    const barHeight = typeKey === 'GRUNT' ? 1.6 : (typeConfig.radius + 0.6);
    hpBar.position.y = barHeight;
    mesh.add(hpBar); // Make it a child of the enemy mesh
    // --------------------------------

    const enemyObj = {
        mesh: mesh,
        hp: typeConfig.hp,
        maxHp: typeConfig.hp,
        config: typeConfig,
        lastAttack: 0,
        hpBar: hpBar, // Reference for updates
        id: Math.random().toString(36)
    };
    mesh.userData.ref = enemyObj; // Link mesh back to logic object

    scene.add(mesh);
    enemies.push(enemyObj);
}

function updateEnemies(delta) {
    const playerPos = camera.position;

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const mesh = e.mesh;
        const dist = mesh.position.distanceTo(playerPos);
        
        // 1. Movement
        mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
        
        // --- ADDED: Make Health Bar Face Camera ---
        if (e.hpBar) {
            e.hpBar.lookAt(camera.position);
        }
        // ------------------------------------------

        const dir = new THREE.Vector3().subVectors(playerPos, mesh.position).normalize();
        
        // Stop if in attack range (except drone who crashes)
        let shouldMove = true;
        if (e.config.type !== 'melee' && dist < e.config.attackRange * 0.7) shouldMove = false;
        
        if (shouldMove) {
            mesh.position.add(dir.multiplyScalar(e.config.speed * delta));
        }

        // 2. Attack Logic
        const now = performance.now();
        if (now - e.lastAttack > e.config.attackRate && dist < e.config.attackRange) {
            if (e.config.type === 'melee') {
                // Drone melee attack
                if (dist < 2) {
                    takeDamage(e.config.damage);
                    e.lastAttack = now;
                }
            } else {
                // Ranged attack
                shootEnemyProjectile(mesh.position, playerPos, e.config);
                e.lastAttack = now;
            }
        }
    }
}

function shootEnemyProjectile(from, to, config) {
    // Visual
    const geo = new THREE.SphereGeometry(config.type === 'heavy' ? 0.6 : 0.3);
    const mat = new THREE.MeshBasicMaterial({ color: config.type === 'heavy' ? 0xff0000 : 0xffaa00 });
    const proj = new THREE.Mesh(geo, mat);
    
    proj.position.copy(from);
    // Height adjust
    proj.position.y += 0.5;

    // Velocity
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    // Predict slight leading? No, keep it simple.
    
    const speed = config.type === 'heavy' ? 20 : 40;
    
    proj.userData = { velocity: dir.multiplyScalar(speed), damage: config.damage, isEnemy: true };
    
    scene.add(proj);
    enemyProjectiles.push(proj);
}

function damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    
    // Flash white
    enemy.mesh.material.emissive.setHex(0xffffff);
    setTimeout(() => { if(enemy.mesh) enemy.mesh.material.emissive.setHex(0x220000); }, 50);

    // --- ADDED: Update Health Bar UI ---
    if (enemy.hpBar) {
        const pct = Math.max(0, enemy.hp / enemy.maxHp);
        enemy.hpBar.userData.fg.scale.x = pct;
        // Change color: Green -> Yellow -> Red
        enemy.hpBar.userData.fg.material.color.setHSL(pct * 0.3, 1, 0.5); 
    }
    // -----------------------------------

    // Hitmarker UI
    hitmarker.classList.remove('hit', 'kill');
    void hitmarker.offsetWidth; // trigger reflow
    if (enemy.hp <= 0) hitmarker.classList.add('kill');
    else hitmarker.classList.add('hit');

    if (enemy.hp <= 0) {
        createExplosion(enemy.mesh.position, enemy.config.color, 15);
        scene.remove(enemy.mesh);
        enemies = enemies.filter(e => e !== enemy);
        player.score += enemy.config.score;
        scoreEl.innerText = player.score;
    }
}

function takeDamage(amount) {
    player.hp -= amount;
    if (player.hp < 0) player.hp = 0;
    
    // Play hurt sound
    if (hurtSound) {
        hurtSound.currentTime = 0;
        hurtSound.play().catch(e => console.log('Audio play failed:', e));
    }
    
    // UI Update
    hpBar.style.width = player.hp + "%";
    if(player.hp < 30) hpBar.style.background = "#f00";
    else hpBar.style.background = "#0f0";

    // Red Flash
    damageOverlay.style.opacity = 1;
    setTimeout(() => damageOverlay.style.opacity = 0, 300);

    if (player.hp <= 0 && !isGameOver) {
        gameOver();
    }
}

// --- Physics & Updates ---

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    if (isGameActive && !isGameOver) {
        // Player Move
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= GRAVITY * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        // Check if player is moving on ground
        const isMoving = (moveForward || moveBackward || moveLeft || moveRight) && canJump;
        
        // Play/pause footstep sound based on movement
        if (footstepSound) {
            if (isMoving) {
                if (footstepSound.paused) {
                    footstepSound.play().catch(e => console.log('Footstep play failed:', e));
                }
            } else {
                if (!footstepSound.paused) {
                    footstepSound.pause();
                    footstepSound.currentTime = 0;
                }
            }
        }

        // --- MODIFIED: Apply Move Speed Multiplier ---
        if (moveForward || moveBackward) velocity.z -= direction.z * PLAYER_SPEED * moveSpeedMultiplier * delta * 50;
        if (moveLeft || moveRight) velocity.x -= direction.x * PLAYER_SPEED * moveSpeedMultiplier * delta * 50;

        // --- Modified Movement with Collision Detection ---
        
        // Try move Right/Left (X axis relative to camera)
        const deltaX = -velocity.x * delta;
        controls.moveRight(deltaX);
        if (checkPlayerCollision()) {
            controls.moveRight(-deltaX); // Revert
            velocity.x = 0; // Stop momentum
        }

        // Try move Forward/Back (Z axis relative to camera)
        const deltaZ = -velocity.z * delta;
        controls.moveForward(deltaZ);
        if (checkPlayerCollision()) {
            controls.moveForward(-deltaZ); // Revert
            velocity.z = 0; // Stop momentum
        }

        // Vertical Movement (No collision check for simplicity in air, just floor check below)
        controls.getObject().position.y += (velocity.y * delta);

        if (controls.getObject().position.y < 2) {
            velocity.y = 0;
            controls.getObject().position.y = 2;
            canJump = true;
        }

        // Update Systems
        updateEnemies(delta);
        updateProjectiles(delta);
        updateParticles(delta);
    }

    renderer.render(scene, camera);
}

function updateProjectiles(delta) {
    // Player Bullets
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
        const p = playerProjectiles[i];
        if (!p.userData.active) continue;

        if (p.userData.gravity) p.userData.velocity.y -= p.userData.gravity * delta;
        p.position.add(p.userData.velocity.clone().multiplyScalar(delta));

        // Collision detection (Simple distance check for prototype)
        let hit = false;
        
        // Floor hit
        if (p.position.y < 0) hit = true;
        
        // Obstacle Hit
        // (Optimized: skipping detailed obstacle check for performance in prototype, just checking floor mainly)

        // Enemy Hit
        if (!hit) {
            for (let e of enemies) {
                if (p.position.distanceTo(e.mesh.position) < (e.config.radius + 0.5)) {
                    if (p.userData.type === 'explosive') {
                        // AOE
                        createExplosion(p.position, p.userData.color, 20);
                        enemies.forEach(nearby => {
                            const d = nearby.mesh.position.distanceTo(p.position);
                            if(d < p.userData.radius) {
                                damageEnemy(nearby, p.userData.damage * (1 - d/p.userData.radius));
                            }
                        });
                    } else {
                        damageEnemy(e, p.userData.damage);
                        createImpact(p.position, p.userData.color);
                    }
                    hit = true;
                    break;
                }
            }
        }

        if (hit || p.position.distanceTo(camera.position) > 200) {
            if (p.userData.type === 'explosive' && !hit) {
                 // Explode on ground
                 createExplosion(p.position, p.userData.color, 20);
                 // Check AOE even on ground hit
                 enemies.forEach(nearby => {
                     const d = nearby.mesh.position.distanceTo(p.position);
                     if(d < p.userData.radius) {
                         damageEnemy(nearby, p.userData.damage * (1 - d/p.userData.radius));
                     }
                 });
            }
            scene.remove(p);
            playerProjectiles.splice(i, 1);
        }
    }

    // Enemy Bullets
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const p = enemyProjectiles[i];
        p.position.add(p.userData.velocity.clone().multiplyScalar(delta));

        // Player Hit
        if (p.position.distanceTo(camera.position) < 1.0) {
            takeDamage(p.userData.damage);
            scene.remove(p);
            enemyProjectiles.splice(i, 1);
            continue;
        }

        // Cleanup
        if (p.position.y < 0 || p.position.distanceTo(camera.position) > 100) {
            scene.remove(p);
            enemyProjectiles.splice(i, 1);
        }
    }
}

// --- VFX ---

function createLaserBeam(color) {
    const material = new THREE.LineBasicMaterial({ color: color });
    const points = [];
    
    // Start gun offset
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const start = new THREE.Vector3().copy(camera.position).add(dir.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0.3, -0.3, 0).applyQuaternion(camera.quaternion));
    const end = new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(50)); // Visual max range

    points.push(start);
    points.push(end);
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    setTimeout(() => scene.remove(line), 40);
}

function createMuzzleFlash(color) {
    const light = new THREE.PointLight(color, 1, 5);
    light.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1));
    scene.add(light);
    setTimeout(() => scene.remove(light), 50);
}

function createImpact(pos, color) {
    createExplosion(pos, color, 5);
}

function createExplosion(pos, color, count) {
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    
    for(let i=0; i<count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = {
            velocity: new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(Math.random()*15),
            life: 1.0
        };
        scene.add(mesh);
        particles.push(mesh);
    }
}

function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.position.add(p.userData.velocity.clone().multiplyScalar(delta));
        p.userData.life -= delta * 2;
        p.scale.multiplyScalar(0.9);
        
        if (p.userData.life <= 0) {
            scene.remove(p);
            particles.splice(i, 1);
        }
    }
}

// --- Input Handling ---

function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': 
            if (canJump === true) {
                velocity.y += JUMP_FORCE;
                canJump = false;
                
                // Play jump sound
                if (jumpSound) {
                    jumpSound.currentTime = 0;
                    jumpSound.play().catch(e => console.log('Jump sound play failed:', e));
                }
            }
            break;
        case 'Digit1': player.weapon = 1; updateWeaponModel(); break;
        case 'Digit2': player.weapon = 2; updateWeaponModel(); break;
        case 'Digit3': player.weapon = 3; updateWeaponModel(); break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
    }
}

function onMouseDown(event) {
    if (controls.isLocked && !isGameOver) {
        shoot();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function gameOver() {
    isGameOver = true;
    controls.unlock();
    overlay.style.display = 'flex';
    missionStatus.style.display = 'block';
    missionStatus.innerText = "MISSION FAILED - SCORE: " + player.score;
    startBtn.innerText = "RESTART MISSION";
    document.getElementById('title-text').innerHTML = "KIA";
    
    // Stop background music and footsteps
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio.currentTime = 0;
    }
    if (footstepSound) {
        footstepSound.pause();
        footstepSound.currentTime = 0;
    }
}

function resetGame() {
    player.hp = 100;
    player.score = 0;
    player.weapon = 1;
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];
    playerProjectiles.forEach(p => scene.remove(p));
    playerProjectiles = [];
    enemyProjectiles.forEach(p => scene.remove(p));
    enemyProjectiles = [];
    
    isGameOver = false;
    missionStatus.style.display = 'none';
    scoreEl.innerText = '0';
    hpBar.style.width = '100%';
    hpBar.style.background = '#0f0';
    
    camera.position.set(0, 2, 0);
    updateWeaponModel();
}
