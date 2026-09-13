(function(){

  // =====================================================================
  // Vegetable directory — identical to script.js / (terminal) so codes
  // line up across the whole app.
  // =====================================================================
  const VEG_MAP = {
  "1": "Banana Poovam", "2": "Banana Robusta", "3": "Guava White Flesh", "4": "Guava Red Flesh",
  "5": "Orange", "6": "Pineapple", "7": "Pear", "8": "Broad Field Beans",
  "9": "Lean Field Beans", "10": "French Country Beans", "11": "French Hybrid Beans", "12": "Cabbage",
  "13": "Muskmelon", "14": "Megha Tomato 3", "15": "Ripe Tomato",
  "16": "BIG Brown Potato", "17": "Small Brown Potato", "18": "Red Potato", "19": "BIG Onion",
  "20": "SMALL Onion", "21": "Ginger", "22": "Turmeric", "23": "Pepper",
  "24": "Small Garlic", "25": "Big Garlic"
};

  // Realistic-ish per-vegetable colors (dark/saturated so they read against
  // the dark housing) instead of a generic repeating palette.
  const VEG_COLORS = {
    "1": 0xB23A2E, "2": 0x35633B, "3": 0x4F7A3D, "4": 0x7FA05C,
    "5": 0xC9C2A0, "6": 0xD9722B, "7": 0x5B3568, "8": 0x3E7A3E,
    "9": 0xC79A5B, "10": 0xD9A62B, "11": 0x8A5A6B, "12": 0xA47B4D,
    "13": 0x3E7A2E, "14": 0x8FAE6B, "15": 0x4F7A4A, "16": 0x6E8A4A,
    "17": 0xD9822B, "18": 0x3E7A5A, "19": 0x6B1F2E, "20": 0xC98A9A,
    "21": 0x6B8A4A, "22": 0x4A7A3E, "23": 0xA0602E, "24": 0xD8D2C0,
    "25": 0x3E7A4A
  };

  function colorForCode(key){
    return VEG_COLORS[key] || 0x5B6B72;
  }

  // =====================================================================
  // Unit geometry — outer housing dimensions (Three.js units).
  // =====================================================================
  const UNIT = { w: 6.2, h: 3.0, d: 4.4 };
  const WALL = 0.1;
  const DOOR_RATIO = 0.58;
  const doorWidth = UNIT.w * DOOR_RATIO;
  const panelWidth = UNIT.w - doorWidth;

  // Door swings OUTWARD, away from the interior, so the leaf never sweeps
  // back over the housing's own footprint or any stored crate.
  const DOOR_OPEN_ANGLE = -1.55;

  const COLORS = {
    housing: 0x16221D,
    steel: 0x35473F,
    steelLight: 0x4A5F55,
    borderSoft: 0x234032,
    leaf: 0x4FA688,
    carrot: 0xFF8A3D,
    screenText: 0x8FE3B8,
    screenDim: 0x4E7D68,
    doorPanel: 0x223A31,   // opaque door, no transparency
    solar: 0x0D1A2E,
    solarLine: 0x1D3A5E,
    keySteel: 0x4A5F55,
    keyBackspace: 0x4A2E22,
    keyEnter: 0x2C6650
  };

  let container, scene, camera, renderer, unitGroup;
  let doorPivot;
  let screenCanvas, screenCtx, screenTexture;
  let peltierLights = [], peltierMeshes = [];
  let pcmMeshes = [];
  let mist, mistVelocities;
  let coolRamp = 0;
  let coolingActive = false;
  let crateSlots = { cols: 0, rows: 0, layers: 0, size: 0, step: 0, originX: 0, originY: 0, originZ: 0 };
  let keypadMeshes = [];
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  // ---- environment: sky / sun / clouds / trees / farmer -------------
  let sunMesh, sunLight, sunGlow;
  let cloudMeshes = [];
  let solarPanelPivots = [];   // one tilting hinge per panel (3 panels total)
  const DAY_LENGTH_MS = 42000; // one full left-to-right sweep of the sun (then eases back)
  const PANEL_TILT_PERIOD_MS = 26000; // panels tilt noticeably slower than the sun sweeps
  const PANEL_MAX_TILT = 0.4; // hard clamp — geometry below is sized so this never dips a panel edge into the roof

  // ---- manual crate placement (a person loads the crate, it is never
  // placed automatically) --------------------------------------------
  let slotOccupied = [];
  let slotMarkers = [];
  let pendingCrate = null; // { mesh, vegName, kg, key, colorHex, picked }

  // Camera orbits a fixed target; the model/rig itself never rotates, so
  // the unit and the farm ground stay in a fixed relationship and the
  // camera elevation is clamped so it can never dip through the floor.
  const orbit = { azimuth: 0.65, elevation: 0.5, radius: 15.5, minElev: 0.14, maxElev: 1.15 };
  let dragging = false, dragMoved = false, prevX = 0, prevY = 0, downX = 0, downY = 0;

  function easeInOut(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; }
  function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function clamp01(x){ return Math.max(0, Math.min(1, x)); }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  // =====================================================================
  // Step chain — each step only starts after the previous one truly
  // finishes (it calls back explicitly), so animations never overlap.
  // =====================================================================
  let stepQueue = [];
  let stepRunning = false;

  function runSteps(steps){
    stepQueue = stepQueue.concat(steps);
    if(!stepRunning) advanceSteps();
  }

  function advanceSteps(){
    if(stepQueue.length === 0){ stepRunning = false; return; }
    stepRunning = true;
    const step = stepQueue.shift();
    step(advanceSteps);
  }

  function tweenStep(duration, update, onDone){
    return function(done){
      const start = performance.now();
      function frame(now){
        const t = clamp01((now - start) / duration);
        update(t);
        if(t < 1){
          requestAnimationFrame(frame);
        } else {
          if(onDone) onDone();
          done();
        }
      }
      requestAnimationFrame(frame);
    };
  }

  // =====================================================================
  // Status / screen readout
  // =====================================================================
  let screenState = {
    heading: "Select a vegetable",
    sub: "Enter the code for the vegetable you'd like to store, then press Enter.",
    buffer: "",
    maxDigits: 2,
    codeLabel: "Code",
    status: "System idle"
  };

  function setStatus(text, dot){
    const line = document.getElementById("sim-status-line");
    if(line) line.textContent = text;
    const dotEl = document.getElementById("sim-status-dot");
    if(dotEl && dot){ dotEl.className = "sim-status-dot " + dot; }
    screenState.status = text;
    drawScreen();
  }

  // Canvas is rendered at 2x resolution and every font/box size scaled up
  // to match, and the texture uses linear filtering + anisotropy below —
  // a low-res canvas stretched onto a 3D plane always looks fuzzy
  // regardless of font size alone, so resolution is what fixes blur here.
  function drawScreen(){
    if(!screenCtx) return;
    const c = screenCtx, cw = screenCanvas.width, ch = screenCanvas.height;
    c.fillStyle = "#0C1613";
    c.fillRect(0, 0, cw, ch);
    c.strokeStyle = "#2E4239";
    c.lineWidth = 10;
    c.strokeRect(5, 5, cw-10, ch-10);

    c.textBaseline = "alphabetic";

    c.fillStyle = "#5FBF95";
    c.font = "bold 46px 'Segoe UI', sans-serif";
    c.fillText("NER-CryoVault", 36, 68);

    c.strokeStyle = "#2E4239";
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(36, 90); c.lineTo(cw-36, 90); c.stroke();

    c.fillStyle = "#A9F0C8";
    c.font = "bold 42px 'Segoe UI', sans-serif";
    c.fillText(screenState.heading, 36, 150);

    c.fillStyle = "#7FAE99";
    c.font = "26px 'Segoe UI', sans-serif";
    wrapText(c, screenState.sub, 36, 190, cw-72, 34);

    // code/weight digit boxes
    c.font = "24px 'Segoe UI', sans-serif";
    c.fillStyle = "#7FAE99";
    c.fillText(screenState.codeLabel, 36, 300);
    const slots = Math.min(Math.max(screenState.buffer.length + 1, 1), screenState.maxDigits);
    for(let i=0;i<slots;i++){
      const bx = 36 + i*78;
      const filled = i < screenState.buffer.length;
      c.fillStyle = filled ? "rgba(143,227,184,0.22)" : "rgba(143,227,184,0.08)";
      c.strokeStyle = filled ? "#5FBF95" : "#2E4239";
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect ? c.roundRect(bx, 316, 62, 72, 9) : c.rect(bx, 316, 62, 72);
      c.fill(); c.stroke();
      if(filled){
        c.fillStyle = "#A9F0C8";
        c.font = "bold 36px 'Segoe UI', sans-serif";
        c.fillText(screenState.buffer[i], bx+18, 364);
        c.font = "24px 'Segoe UI', sans-serif";
      }
    }

    c.fillStyle = "#FF9A50";
    c.font = "bold 28px 'Segoe UI', sans-serif";
    wrapText(c, screenState.status, 36, 452, cw-72, 34);

    if(screenTexture) screenTexture.needsUpdate = true;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight){
    const words = String(text).split(" ");
    let line = "";
    let cy = y;
    for(let i=0;i<words.length;i++){
      const test = line + words[i] + " ";
      if(ctx.measureText(test).width > maxWidth && line !== ""){
        ctx.fillText(line, x, cy);
        line = words[i] + " ";
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, cy);
  }

  // =====================================================================
  // Scene construction
  // =====================================================================
  function init(){
    container = document.getElementById("sim-scene");
    if(!container || typeof THREE === "undefined") return;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 200);
    updateCameraFromOrbit();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x445a4e, 1.05));
    const key = new THREE.DirectionalLight(0xdfffe9, 0.35);
    key.position.set(7, 11, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x2f6e8b, 0.2);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    buildEnvironment();

    // Concrete pad the unit sits on. This stays fixed and flat — the
    // model/rig is never rotated, only the camera orbits, so the pad and
    // the unit are always in the same static relationship.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(9.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x8c8a7c, roughness: 1 })
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -UNIT.h/2 - 0.02;
    scene.add(ground);
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(6.4, 6.5, 64),
      new THREE.MeshBasicMaterial({ color: 0x234032, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    groundRing.rotation.x = -Math.PI/2;
    groundRing.position.y = -UNIT.h/2 - 0.015;
    scene.add(groundRing);

    unitGroup = new THREE.Group();
    scene.add(unitGroup);

    buildHousing();
    buildRoofSolarPanels();
    buildFrontDoor();
    buildControlPanel();
    buildInterior();
    buildFarmerFigure();
    initSlotOccupancy();

    bindPointer();
    window.addEventListener("resize", onResize);

    setStatus("System idle — use the keypad to select a vegetable", "idle");
    animate();
  }

  function panelMaterial(color, opts){
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.2 }, opts || {}));
  }

  function addEdges(mesh, color){
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: color || COLORS.borderSoft, transparent: true, opacity: 0.9 })
    );
    mesh.add(edges);
  }

  // =====================================================================
  // Farm environment — sky, sun, drifting clouds, trees around a rural
  // homestead setting so the unit reads as deployed in the field.
  // =====================================================================
  function buildEnvironment(){
    buildSky();
    buildFarmGround();
    buildSun();
    buildClouds();
    buildTrees();
  }

  function buildSky(){
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 4; skyCanvas.height = 512;
    const ctx = skyCanvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#6FAEE6");
    grad.addColorStop(0.42, "#B7DDEE");
    grad.addColorStop(0.72, "#E9DFB6");
    grad.addColorStop(1, "#F4CE8C");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(skyCanvas);
    scene.background = tex;
    // Fog is kept short-range only (near the ground) and its "far" edge is
    // pushed well beyond the sun's orbit so the sun itself never gets
    // faded into invisibility by the fog blend.
    scene.fog = new THREE.Fog(0xC7E1EC, 22, 90);
  }

  function buildFarmGround(){
    const grassCanvas = document.createElement("canvas");
    grassCanvas.width = 256; grassCanvas.height = 256;
    const gctx = grassCanvas.getContext("2d");
    gctx.fillStyle = "#5C7A3E";
    gctx.fillRect(0, 0, 256, 256);
    for(let i=0;i<900;i++){
      gctx.fillStyle = Math.random() > 0.5 ? "rgba(90,120,55,0.5)" : "rgba(130,150,80,0.4)";
      const x = Math.random()*256, y = Math.random()*256;
      gctx.fillRect(x, y, 2, 6);
    }
    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(10, 10);

    const farmGround = new THREE.Mesh(
      new THREE.CircleGeometry(50, 48),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
    );
    farmGround.rotation.x = -Math.PI/2;
    farmGround.position.y = -UNIT.h/2 - 0.03;
    scene.add(farmGround);

    // a simple dirt track leading up to the pad
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 })
    );
    track.rotation.x = -Math.PI/2;
    track.position.set(0, -UNIT.h/2 - 0.025, UNIT.d/2 + 8);
    scene.add(track);
  }

  function makeGlowTexture(){
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,250,225,0.95)");
    g.addColorStop(1, "rgba(255,250,225,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function buildSun(){
    // fog:false on both the disc and its glow — otherwise the scene fog
    // blends the sun toward the fog color as it nears the horizon/edge of
    // its arc and it visually disappears against the sky.
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xFFF3D0, fog: false });
    sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 24), sunMat);
    scene.add(sunMesh);

    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: 0xFFE7A8, transparent: true, opacity: 0.75, depthWrite: false, fog: false
    }));
    sunGlow.scale.set(13, 13, 1);
    sunMesh.add(sunGlow);

    sunLight = new THREE.DirectionalLight(0xFFF4D8, 0.85);
    scene.add(sunLight);
    scene.add(sunLight.target);
  }

  function buildClouds(){
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    for(let i=0;i<7;i++){
      const group = new THREE.Group();
      const puffs = 4 + Math.floor(Math.random()*3);
      for(let p=0;p<puffs;p++){
        const r = 1.0 + Math.random()*0.9;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
        puff.position.set((Math.random()-0.5)*3.4, (Math.random()-0.5)*0.5, (Math.random()-0.5)*1.6);
        group.add(puff);
      }
      const angle = Math.random()*Math.PI*2;
      const radius = 20 + Math.random()*14;
      group.position.set(Math.cos(angle)*radius, 8.5+Math.random()*5, Math.sin(angle)*radius);
      group.userData.driftSpeed = 0.12 + Math.random()*0.18;
      scene.add(group);
      cloudMeshes.push(group);
    }
  }

  function buildTrees(){
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5B3E28, roughness: 0.95 });
    const leafColors = [0x3E7A3E, 0x4C8A4C, 0x357A4A, 0x5A8A3E];
    for(let i=0;i<16;i++){
      const angle = (i / 16) * Math.PI * 2 + Math.random()*0.3;
      const radius = 9 + Math.random()*7;
      // skip the wedge of ground in front of the door/track so the
      // approach to the unit stays clear
      const facing = Math.atan2(Math.sin(angle), Math.cos(angle));
      if(Math.abs(facing - Math.PI/2) < 0.5 && radius < 14) continue;

      const tree = new THREE.Group();
      const trunkH = 1.6 + Math.random()*0.9;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, trunkH, 6), trunkMat);
      trunk.position.y = trunkH/2 - UNIT.h/2 - 0.02;
      tree.add(trunk);

      const leafMat = new THREE.MeshStandardMaterial({ color: leafColors[i % leafColors.length], roughness: 0.85 });
      for(let t=0;t<3;t++){
        const cr = 0.9 - t*0.22;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, 1.05, 8), leafMat);
        cone.position.y = trunkH - UNIT.h/2 - 0.02 + t*0.5 + 0.4;
        tree.add(cone);
      }

      tree.position.set(Math.cos(angle)*radius, 0, Math.sin(angle)*radius);
      tree.rotation.y = Math.random()*Math.PI*2;
      const s = 0.8 + Math.random()*0.55;
      tree.scale.set(s, s, s);
      scene.add(tree);
    }
  }

  function buildFarmerFigure(){
    const farmer = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x9C6B45, roughness: 0.85 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3E6E8A, roughness: 0.8 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x365E78, roughness: 0.82 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x30392E, roughness: 0.88 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1E1A16, roughness: 0.75 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xD8C48A, roughness: 0.88 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x3A281C, roughness: 0.7 });

    // --- legs: two separate tapered cylinders instead of one merged
    // pole, plus ankle taper and simple shoes, so it reads as a person
    // standing rather than a robed shape.
    [-1, 1].forEach((side) => {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.46, 10), pantsMat);
      thigh.position.set(side * 0.1, 0.62, 0);
      farmer.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.42, 10), pantsMat);
      shin.position.set(side * 0.1, 0.2, 0.01);
      farmer.add(shin);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), shoeMat);
      shoe.position.set(side * 0.1, 0.02, 0.05);
      farmer.add(shoe);
    });

    // --- hips/waist block ties the two legs together naturally
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.16, 12), pantsMat);
    hips.position.y = 0.9;
    farmer.add(hips);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.05, 12), beltMat);
    belt.position.y = 0.97;
    farmer.add(belt);

    // --- tapered torso (narrower at the waist, broader at the shoulders)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.62, 12), shirtMat);
    torso.position.y = 1.32;
    farmer.add(torso);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), skinMat);
    neck.position.y = 1.66;
    farmer.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 16), skinMat);
    head.position.y = 1.8;
    head.scale.set(1, 1.08, 0.94);
    farmer.add(head);

    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.17, 16), hatMat);
    hat.position.y = 1.955;
    farmer.add(hat);
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.025, 20), hatMat);
    hatBrim.position.y = 1.885;
    farmer.add(hatBrim);

    // --- jointed arms: upper arm + forearm meeting at an elbow bend,
    // with a small hand, instead of one straight rigid cylinder.
    [-1, 1].forEach((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.24, 1.52, 0);
      shoulder.rotation.z = side * 0.18;
      farmer.add(shoulder);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.32, 10), sleeveMat);
      upperArm.position.y = -0.16;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      elbow.rotation.z = side * -0.22;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.3, 10), skinMat);
      forearm.position.y = -0.15;
      elbow.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), skinMat);
      hand.position.y = -0.31;
      elbow.add(hand);
    });

    // Stood on the control-panel (dial pad) side of the front face, well
    // clear of the door's hinge (which sits at -UNIT.w/2) and the full
    // arc it swings through when opening/closing — so the door can never
    // reach the farmer.
    const panelCenterX = UNIT.w/2 - panelWidth/2;
    farmer.position.set(panelCenterX + panelWidth*0.32, -UNIT.h/2 + WALL, UNIT.d/2 + 2.3);
    farmer.rotation.y = -Math.PI * 0.12;
    unitGroup.add(farmer);
  }

  function buildHousing(){
    const floor = new THREE.Mesh(new THREE.BoxGeometry(UNIT.w, WALL, UNIT.d), panelMaterial(COLORS.steel));
    floor.position.y = -UNIT.h/2;
    unitGroup.add(floor); addEdges(floor);

    const back = new THREE.Mesh(new THREE.BoxGeometry(UNIT.w, UNIT.h, WALL), panelMaterial(COLORS.steel));
    back.position.z = -UNIT.d/2;
    unitGroup.add(back); addEdges(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(WALL, UNIT.h, UNIT.d), panelMaterial(0x1E2D26));
    left.position.x = -UNIT.w/2;
    unitGroup.add(left); addEdges(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(WALL, UNIT.h, UNIT.d), panelMaterial(0x1E2D26));
    right.position.x = UNIT.w/2;
    unitGroup.add(right); addEdges(right);

    const roofBase = new THREE.Mesh(new THREE.BoxGeometry(UNIT.w + 0.1, WALL, UNIT.d + 0.1), panelMaterial(COLORS.steel));
    roofBase.position.y = UNIT.h/2;
    unitGroup.add(roofBase); addEdges(roofBase);
  }

  // =====================================================================
  // Roof solar array — three independent tilting panels, each on its own
  // fixed A-frame stand: two static legs hold a short hinge, a worm-gear
  // box sits at one end of that hinge (bolted to the stand, it never
  // spins), and only the panel above it tilts slowly back and forth to
  // track the sun. Nothing rotates continuously, and each panel is sized
  // so the clamped tilt angle (PANEL_MAX_TILT) can never bring its lower
  // edge down through the roof line.
  // =====================================================================
  function buildRoofSolarPanels(){
    const roofGroup = new THREE.Group();
    roofGroup.position.set(0, UNIT.h/2 + 0.05, 0);
    unitGroup.add(roofGroup);

    const standMat = panelMaterial(COLORS.steelLight, { metalness: 0.6, roughness: 0.35 });
    const hingeH = 0.34; // height of the hinge axis above the roof
    const panelCount = 3;
    const rowSpanX = UNIT.w * 0.86;
    const stepX = rowSpanX / panelCount;
    const panelW = stepX - 0.14;   // leaves a visible gap between the 3 panels
    const panelD = UNIT.d * 0.78;
    const panelMat = panelMaterial(COLORS.solar, { roughness: 0.3, metalness: 0.55 });
    const gridMat = new THREE.LineBasicMaterial({ color: COLORS.solarLine, transparent: true, opacity: 0.7 });

    for(let i=0;i<panelCount;i++){
      const xOffset = (i - (panelCount-1)/2) * stepX;
      const unit = new THREE.Group();
      unit.position.set(xOffset, 0, 0);
      roofGroup.add(unit);

      // Two fixed A-frame legs (front + back) supporting this panel's
      // hinge. These belong to the static unit group, not the pivot, so
      // they never move.
      [-1, 1].forEach((side) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, hingeH, 0.09), standMat);
        leg.position.set(0, hingeH/2, side * (UNIT.d*0.32));
        unit.add(leg);
        addEdges(leg, COLORS.solarLine);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), standMat);
        foot.position.set(0, 0.02, side * (UNIT.d*0.32));
        unit.add(foot);
      });

      // Static hinge bar running between the two legs (the axle this
      // panel tilts around). It sits still — only the panel rotates.
      const hingeBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, UNIT.d*0.64 + 0.16, 12),
        panelMaterial(0x33403A, { metalness: 0.7, roughness: 0.3 })
      );
      hingeBar.rotation.x = Math.PI/2;
      hingeBar.position.set(0, hingeH, 0);
      unit.add(hingeBar);

      // Worm-gear / motor housing, fixed to one end of the hinge bar. It
      // stays bolted to the stand and does not spin — only the small
      // decorative gear disc on its face hints at the mechanism.
      const gearboxGroup = new THREE.Group();
      gearboxGroup.position.set(0, hingeH, UNIT.d*0.32 + 0.11);
      unit.add(gearboxGroup);

      const motorBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.2, 14),
        panelMaterial(0x2B3F55, { metalness: 0.65, roughness: 0.3 })
      );
      motorBody.rotation.x = Math.PI/2;
      motorBody.position.z = 0.12;
      gearboxGroup.add(motorBody);

      const gearDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.04, 18),
        panelMaterial(0x8A94A0, { metalness: 0.8, roughness: 0.25 })
      );
      gearDisc.rotation.x = Math.PI/2;
      gearboxGroup.add(gearDisc);
      addEdges(gearDisc, 0xB9C4CE);

      // ---- the panel itself, tilting on this unit's own pivot
      const pivot = new THREE.Group();
      pivot.position.set(0, hingeH, 0);
      unit.add(pivot);

      // Short bracket arms lift the panel slightly above the hinge axis.
      [-1, 1].forEach((side) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), standMat);
        arm.position.set(0, 0.08, side * (panelD*0.5 - 0.13));
        pivot.add(arm);
      });

      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.05, panelD), panelMat);
      panel.position.set(0, 0.16, 0);
      pivot.add(panel);
      addEdges(panel, COLORS.solarLine);

      const gridPts = [];
      for(let g=1; g<5; g++){
        const gx = -panelW/2 + (panelW/5)*g;
        gridPts.push(new THREE.Vector3(gx, 0.028, -panelD/2+0.03), new THREE.Vector3(gx, 0.028, panelD/2-0.03));
      }
      for(let g=1; g<4; g++){
        const gz = -panelD/2 + (panelD/4)*g;
        gridPts.push(new THREE.Vector3(-panelW/2+0.03, 0.028, gz), new THREE.Vector3(panelW/2-0.03, 0.028, gz));
      }
      const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPts);
      panel.add(new THREE.LineSegments(gridGeo, gridMat));

      solarPanelPivots.push(pivot);
    }
  }

  // Solid, opaque door that swings outward through a small arc so it can
  // never sweep back over the crates stored inside.
  function buildFrontDoor(){
    const hingeX = -UNIT.w/2;
    doorPivot = new THREE.Group();
    doorPivot.position.set(hingeX, 0, UNIT.d/2 - WALL/2);
    unitGroup.add(doorPivot);

    const doorMat = panelMaterial(COLORS.doorPanel, { roughness: 0.55, metalness: 0.25 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.05, UNIT.h - WALL, 0.06), doorMat);
    door.position.x = (doorWidth - 0.05)/2;
    doorPivot.add(door);
    addEdges(door, COLORS.screenText);

    const window1 = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth * 0.6, UNIT.h * 0.42, 0.03),
      panelMaterial(0x0F1E19, { roughness: 0.25, metalness: 0.1 })
    );
    window1.position.set((doorWidth - 0.05)/2, UNIT.h*0.12, 0.05);
    doorPivot.add(window1);
    addEdges(window1, COLORS.screenText);

    const frameMat = panelMaterial(COLORS.steel);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, UNIT.h - WALL, 0.08), frameMat);
    vBar.position.set(doorWidth - 0.08, 0, 0);
    doorPivot.add(vBar);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10),
      panelMaterial(COLORS.steelLight, { metalness: 0.6, roughness: 0.3 })
    );
    handle.rotation.z = Math.PI/2;
    handle.position.set(doorWidth - 0.2, 0, 0.06);
    doorPivot.add(handle);
  }

  // ---- canvas texture used for keypad key labels ----
  function makeKeyTexture(label, bg){
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 96;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, cv.width-4, cv.height-4);
    ctx.fillStyle = "#EDF3EE";
    ctx.font = "bold 44px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cv.width/2, cv.height/2 + 2);
    return new THREE.CanvasTexture(cv);
  }

  // Keypad is modeled on the control panel itself and is clickable via
  // raycast — there is no separate DOM keypad.
  function buildControlPanel(){
    const cx = UNIT.w/2 - panelWidth/2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelWidth - 0.05, UNIT.h - WALL, 0.1), panelMaterial(0x1B2620));
    panel.position.set(cx, 0, UNIT.d/2 - WALL/2);
    unitGroup.add(panel); addEdges(panel);

    screenCanvas = document.createElement("canvas");
    screenCanvas.width = 960; screenCanvas.height = 600;
    screenCtx = screenCanvas.getContext("2d");
    screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
    screenTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth * 0.78, 0.9),
      new THREE.MeshBasicMaterial({ map: screenTexture })
    );
    screenMesh.position.set(cx, 0.72, UNIT.d/2 - WALL/2 + 0.07);
    unitGroup.add(screenMesh);
    drawScreen();

    const logo = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 24),
      new THREE.MeshStandardMaterial({ color: COLORS.leaf, emissive: 0x1E4A38, emissiveIntensity: 0.6 })
    );
    logo.position.set(cx + panelWidth*0.32, 1.15, UNIT.d/2 - WALL/2 + 0.06);
    unitGroup.add(logo);

    const layout = [
      ["1","2","3"],
      ["4","5","6"],
      ["7","8","9"],
      ["backspace","0","enter"]
    ];
    const labelFor = { backspace: "⌫", enter: "ENT" };
    const kw = 0.3, kh = 0.2, gap = 0.1;
    const gridW = kw*3 + gap*2;
    const startX = cx - gridW/2 + kw/2;
    const startY = 0.02;
    const z = UNIT.d/2 - WALL/2 + 0.08;

    layout.forEach((row, r) => {
      row.forEach((keyVal, col) => {
        let bg = "#4A5F55";
        if(keyVal === "backspace") bg = "#4A2E22";
        if(keyVal === "enter") bg = "#2C6650";
        const label = labelFor[keyVal] || keyVal;
        const tex = makeKeyTexture(label, bg);

        const baseColor = keyVal === "backspace" ? COLORS.keyBackspace
                         : keyVal === "enter" ? COLORS.keyEnter
                         : COLORS.keySteel;
        const sideMat = panelMaterial(baseColor, { metalness: 0.3, roughness: 0.5 });
        const faceMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.2, roughness: 0.5 });
        const materials = [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat];

        const keyMesh = new THREE.Mesh(new THREE.BoxGeometry(kw, kh, 0.06), materials);
        keyMesh.position.set(startX + col*(kw+gap), startY - r*(kh+gap), z);
        keyMesh.userData.keyValue = keyVal;
        keyMesh.userData.baseZ = z;
        unitGroup.add(keyMesh);
        addEdges(keyMesh, 0x1D2A24);
        keypadMeshes.push(keyMesh);
      });
    });
  }

  function buildInterior(){
    const doorCenterX = -UNIT.w/2 + doorWidth/2;
    const innerW = doorWidth - WALL*2 - 0.1;
    const innerD = UNIT.d - WALL*2 - 0.1;
    const innerH = UNIT.h - WALL*2 - 0.1;
    const floorY = -UNIT.h/2 + WALL;

    const peltierMat = new THREE.MeshStandardMaterial({ color: 0x8A9490, metalness: 0.7, roughness: 0.35, emissive: 0x000000, emissiveIntensity: 0 });
    const modCount = 4;
    for(let i=0;i<modCount;i++){
      const mod = new THREE.Group();
      const bodyW = innerW/modCount * 0.7;
      const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, 0.28, 0.14), peltierMat.clone());
      mod.add(body);
      for(let f=0; f<4; f++){
        const fin = new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.85, 0.03, 0.1), new THREE.MeshStandardMaterial({ color: 0x6E7A76, metalness: 0.6, roughness: 0.4 }));
        fin.position.y = -0.08 + f*0.055;
        fin.position.z = 0.02;
        mod.add(fin);
      }
      mod.position.set(doorCenterX - innerW/2 + bodyW*0.9 + i*(innerW/modCount), floorY + innerH - 0.25, -UNIT.d/2 + WALL + 0.09);
      unitGroup.add(mod);

      const light = new THREE.PointLight(0x8FE3B8, 0, 2.4);
      light.position.set(mod.position.x, mod.position.y - 0.3, mod.position.z + 0.6);
      unitGroup.add(light);

      peltierMeshes.push(body);
      peltierLights.push(light);
    }

    // PCM slabs are solid/opaque; only their color and emissive glow
    // shift when cooling is active — no opacity blending.
    const pcmNeutral = new THREE.Color(0x2E4239);
    const pcmMat = new THREE.MeshStandardMaterial({
      color: pcmNeutral.clone(), roughness: 0.4, metalness: 0.1,
      emissive: 0x000000, emissiveIntensity: 0
    });
    const slabPositions = [
      { x: doorCenterX - innerW/2 + 0.05, z: -innerD/2 + 0.7 },
      { x: doorCenterX - innerW/2 + 0.05, z: innerD/2 - 0.7 },
      { x: doorCenterX + innerW/2 - 0.05, z: -innerD/2 + 0.7 },
      { x: doorCenterX + innerW/2 - 0.05, z: innerD/2 - 0.7 }
    ];
    slabPositions.forEach(p => {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.06, innerH*0.72, 0.9), pcmMat.clone());
      slab.position.set(p.x, floorY + innerH*0.4, p.z);
      unitGroup.add(slab);
      addEdges(slab, 0x8FE3B8);
      pcmMeshes.push(slab);
    });

    const crateSize = 0.5, gap = 0.1, step = crateSize + gap;
    const cols = Math.max(1, Math.floor(innerW/step));
    const rows = Math.max(1, Math.floor(innerD/step));
    const layers = Math.max(1, Math.floor((innerH-0.15)/step));
    crateSlots = {
      cols, rows, layers, size: crateSize, step,
      originX: doorCenterX - (cols*step)/2 + step/2,
      originY: floorY + crateSize/2,
      originZ: -(rows*step)/2 + step/2
    };

    const mistCount = 160;
    const positions = new Float32Array(mistCount*3);
    mistVelocities = new Float32Array(mistCount);
    for(let i=0;i<mistCount;i++){
      positions[i*3] = doorCenterX + (Math.random()-0.5)*innerW;
      positions[i*3+1] = floorY + Math.random()*innerH;
      positions[i*3+2] = (Math.random()-0.5)*innerD;
      mistVelocities[i] = 0.15 + Math.random()*0.25;
    }
    const mistGeo = new THREE.BufferGeometry();
    mistGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mistMat = new THREE.PointsMaterial({
      color: 0x8FE3B8, size: 0.045, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    mist = new THREE.Points(mistGeo, mistMat);
    mist.visible = false;
    mist.userData.floorY = floorY;
    mist.userData.innerH = innerH;
    unitGroup.add(mist);
  }

  // =====================================================================
  // Slot occupancy — tracks which of the interior slots already hold a
  // crate, so empty-slot markers can be shown for manual placement.
  // =====================================================================
  function initSlotOccupancy(){
    const capacity = crateSlots.cols * crateSlots.rows * crateSlots.layers;
    slotOccupied = new Array(capacity).fill(false);
  }

  function slotPositionForIndex(idx){
    const { cols, rows, step, originX, originY, originZ } = crateSlots;
    const layer = Math.floor(idx / (cols*rows));
    const rem = idx % (cols*rows);
    const row = Math.floor(rem / cols);
    const col = rem % cols;
    return new THREE.Vector3(originX + col*step, originY + layer*step, originZ + row*step);
  }

  // =====================================================================
  // Crate design — a slatted produce crate with a few vegetables sitting
  // inside it, colored per vegetable code (VEG_COLORS above).
  // =====================================================================
  function buildCrateMesh(colorHex){
    const size = crateSlots.size;
    const group = new THREE.Group();

    const woodMat = panelMaterial(0x6E5334, { roughness: 0.9, metalness: 0 });
    const crateH = size * 0.72;

    const postT = size * 0.09;
    const postPositions = [
      [-size/2+postT/2, -size/2+postT/2], [ size/2-postT/2, -size/2+postT/2],
      [-size/2+postT/2,  size/2-postT/2], [ size/2-postT/2,  size/2-postT/2]
    ];
    postPositions.forEach(([px,pz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(postT, crateH, postT), woodMat);
      post.position.set(px, 0, pz);
      group.add(post);
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(size*0.92, size*0.1, size*0.92), woodMat);
    base.position.y = -crateH/2 + size*0.05;
    group.add(base);

    [-1, 0.15].forEach((frac) => {
      const slatY = frac * crateH * 0.4;
      const slatFront = new THREE.Mesh(new THREE.BoxGeometry(size*0.92, size*0.08, postT*0.8), woodMat);
      slatFront.position.set(0, slatY, size/2 - postT/2);
      group.add(slatFront);
      const slatBack = slatFront.clone();
      slatBack.position.z = -(size/2 - postT/2);
      group.add(slatBack);
      const slatLeft = new THREE.Mesh(new THREE.BoxGeometry(postT*0.8, size*0.08, size*0.92), woodMat);
      slatLeft.position.set(-(size/2 - postT/2), slatY, 0);
      group.add(slatLeft);
      const slatRight = slatLeft.clone();
      slatRight.position.x = size/2 - postT/2;
      group.add(slatRight);
    });

    addEdges(base, 0x2A1D10);

    const vegMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.05 });
    const vegCount = 5;
    for(let i=0;i<vegCount;i++){
      const r = size * (0.14 + Math.random()*0.05);
      const veg = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), vegMat);
      const angle = (i / vegCount) * Math.PI * 2;
      const rad = size * 0.24;
      veg.position.set(Math.cos(angle)*rad*0.6, crateH/2 + r*0.6, Math.sin(angle)*rad*0.6);
      veg.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
      group.add(veg);
    }

    return group;
  }

  // =====================================================================
  // Manual crate placement flow:
  //   1. Farmer enters code + weight on the keypad.
  //   2. Door opens automatically and the loaded crate appears at the
  //      threshold, outside the unit — it does NOT move itself.
  //   3. The person clicks the crate to pick it up, then clicks a
  //      highlighted empty slot inside to place it there.
  //   4. Once placed, the door closes and cooling ramps up.
  // =====================================================================
  function beginManualStorage(vegName, kg, key){
    const colorHex = colorForCode(key);
    runSteps([
      tweenStep(1100, (t) => {
        doorPivot.rotation.y = lerp(0, DOOR_OPEN_ANGLE, easeOutCubic(t));
        setStatus("Opening door…", "busy");
      }, () => {
        spawnPendingCrateAtDoor(vegName, kg, key, colorHex);
      })
    ]);
  }

  function spawnPendingCrateAtDoor(vegName, kg, key, colorHex){
    const crate = buildCrateMesh(colorHex);
    const doorCenterX = -UNIT.w/2 + doorWidth/2;
    crate.position.set(doorCenterX, -UNIT.h/2 + WALL + crateSlots.size*0.62, UNIT.d/2 + 1.35);
    crate.rotation.y = 0.15;

    // a soft glowing outline signals this crate is the one to tap
    const outline = new THREE.Mesh(
      new THREE.BoxGeometry(crateSlots.size*1.15, crateSlots.size*1.0, crateSlots.size*1.15),
      new THREE.MeshBasicMaterial({ color: 0xFFD27A, wireframe: true, transparent: true, opacity: 0.85 })
    );
    crate.add(outline);
    crate.userData.outline = outline;

    unitGroup.add(crate);
    pendingCrate = { mesh: crate, vegName, kg, key, colorHex, picked: false };

    setStatus(`${vegName} crate ready at the door — tap it, then tap an open slot inside`, "busy");
    screenState.heading = "Place the crate";
    screenState.sub = `Tap the ${vegName} crate at the door, then tap a highlighted slot inside to store it.`;
    screenState.buffer = "";
    screenState.maxDigits = 0;
    drawScreen();
  }

  function pickUpPendingCrate(){
    if(!pendingCrate || pendingCrate.picked) return;
    pendingCrate.picked = true;
    pendingCrate.mesh.position.y += 0.15;
    if(pendingCrate.mesh.userData.outline) pendingCrate.mesh.userData.outline.visible = false;

    setStatus(`Carrying ${pendingCrate.vegName} crate — tap an open slot to place it`, "busy");
    screenState.sub = "Tap a highlighted empty slot inside the vault to place the crate.";
    drawScreen();
    showSlotMarkers();
  }

  function showSlotMarkers(){
    clearSlotMarkers();
    const capacity = crateSlots.cols * crateSlots.rows * crateSlots.layers;
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x8FE3B8, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
    for(let i=0;i<capacity;i++){
      if(slotOccupied[i]) continue;
      const pos = slotPositionForIndex(i);
      const size = crateSlots.size;
      const marker = new THREE.Mesh(new THREE.BoxGeometry(size*0.92, size*0.08, size*0.92), markerMat.clone());
      marker.position.set(pos.x, pos.y - size*0.46, pos.z);
      unitGroup.add(marker);
      addEdges(marker, 0x8FE3B8);
      slotMarkers.push({ mesh: marker, index: i });
    }
  }

  function clearSlotMarkers(){
    slotMarkers.forEach(m => unitGroup.remove(m.mesh));
    slotMarkers = [];
  }

  function placeCrateInSlot(index){
    if(!pendingCrate) return;
    const target = slotPositionForIndex(index);
    const crate = pendingCrate.mesh;
    const start = crate.position.clone();
    const vegName = pendingCrate.vegName, kg = pendingCrate.kg;
    clearSlotMarkers();
    setStatus(`Placing ${vegName} crate…`, "busy");

    runSteps([
      tweenStep(700, (t) => {
        const e = easeInOut(t);
        crate.position.x = lerp(start.x, target.x, e);
        crate.position.z = lerp(start.z, target.z, e);
        const arc = Math.sin(t*Math.PI) * 0.5;
        crate.position.y = lerp(start.y, target.y, e) + arc;
      }, () => {
        slotOccupied[index] = true;
        pendingCrate = null;
      }),
      tweenStep(1000, (t) => {
        doorPivot.rotation.y = lerp(DOOR_OPEN_ANGLE, 0, easeOutCubic(t));
        setStatus("Closing door…", "busy");
      }),
      tweenStep(1400, (t) => {
        coolRamp = coolingActive ? 1 : easeInOut(t);
        applyCoolingVisuals(coolRamp);
      }, () => {
        coolingActive = true;
        coolRamp = 1;
        setStatus(`${vegName} stored — ${kg} kg — Peltier & PCM cooling stable`, "active");
        resetEntry();
      })
    ]);
  }

  function applyCoolingVisuals(ramp){
    peltierMeshes.forEach((m) => { m.material.emissive.setHex(0x1E4A38); m.material.emissiveIntensity = ramp*1.1; });
    peltierLights.forEach((l) => { l.intensity = ramp*1.1; });
    const cold = new THREE.Color(0x8FE3B8);
    const neutral = new THREE.Color(0x2E4239);
    pcmMeshes.forEach((m) => {
      m.material.color.copy(neutral).lerp(cold, ramp);
      m.material.emissive.copy(cold);
      m.material.emissiveIntensity = ramp*0.4;
    });
    mist.visible = ramp > 0.02;
  }

  // =====================================================================
  // Sun position + solar-panel tracking. The sun glides slowly left to
  // right across the sky then eases back (no hard jump-cut), and the
  // roof panel tilts around the fixed hinge to keep facing it.
  // =====================================================================
  function updateSunTracking(now){
    if(!sunMesh) return;

    // Smooth back-and-forth sweep instead of a snap-back loop: cycle
    // rises 0->1 over DAY_LENGTH_MS then eases back 1->0 over the next
    // DAY_LENGTH_MS, so the sun's motion never jumps.
    const period = DAY_LENGTH_MS * 2;
    const raw = (now % period) / DAY_LENGTH_MS; // 0..2
    const cycle = raw <= 1 ? raw : 2 - raw;      // 0..1..0, smooth
    const angle = Math.PI * cycle; // 0 -> PI, left horizon to right horizon

    const sunRadius = 34;
    const sunHeight = Math.sin(angle) * 20 + 6;
    const sunX = Math.cos(Math.PI - angle) * sunRadius;

    sunMesh.position.set(sunX, sunHeight, -sunRadius*0.55);
    sunLight.position.copy(sunMesh.position);
    sunLight.target.position.set(0, 0, 0);
    sunLight.intensity = 0.45 + Math.sin(angle)*0.55;

    const dayLight = clamp01(Math.sin(angle) + 0.15);
    if(scene.fog) scene.fog.near = 20 + dayLight*4;

    // Panels tilt slowly on their own clock (slower than the sun sweeps),
    // clamped to PANEL_MAX_TILT so the geometry above never lets a panel
    // edge dip into the roof — the stands themselves never move.
    if(solarPanelPivots.length){
      const panelPeriod = PANEL_TILT_PERIOD_MS * 2;
      const panelRaw = (now % panelPeriod) / PANEL_TILT_PERIOD_MS; // 0..2
      const panelCycle = panelRaw <= 1 ? panelRaw : 2 - panelRaw;  // 0..1..0, smooth
      const trackAngle = clamp((panelCycle - 0.5) * 2 * PANEL_MAX_TILT, -PANEL_MAX_TILT, PANEL_MAX_TILT);
      solarPanelPivots.forEach((pivot) => { pivot.rotation.z = -trackAngle; });
    }
  }

  function updateClouds(){
    cloudMeshes.forEach((c) => {
      c.position.x += c.userData.driftSpeed * 0.01;
      if(c.position.x > 45) c.position.x = -45;
    });
  }

  // =====================================================================
  // Camera orbit (replaces rotating the model)
  // =====================================================================
  function updateCameraFromOrbit(){
    if(!camera) return;
    const r = orbit.radius;
    camera.position.x = r * Math.sin(orbit.azimuth) * Math.cos(orbit.elevation);
    camera.position.z = r * Math.cos(orbit.azimuth) * Math.cos(orbit.elevation);
    camera.position.y = r * Math.sin(orbit.elevation) + 0.4;
    camera.lookAt(0, 0.3, 0);
  }

  // =====================================================================
  // Main loop
  // =====================================================================
  function animate(){
    requestAnimationFrame(animate);
    const now = performance.now();

    updateCameraFromOrbit();
    updateSunTracking(now);
    updateClouds();

    if(coolingActive){
      const pulse = Math.sin(now*0.0022)*0.15;
      peltierLights.forEach((l) => { l.intensity = Math.max(0, 1.1 + pulse); });
      peltierMeshes.forEach((m) => { m.material.emissiveIntensity = Math.max(0, 1.1 + pulse); });
    }

    if(mist && mist.visible){
      const pos = mist.geometry.attributes.position;
      const floorY = mist.userData.floorY, innerH = mist.userData.innerH;
      for(let i=0;i<pos.count;i++){
        let y = pos.getY(i) + mistVelocities[i]*0.008;
        if(y > floorY + innerH) y = floorY;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  // =====================================================================
  // Pointer handling — orbit-drag vs. a real click on the keypad, the
  // pending crate, or an empty-slot marker.
  // =====================================================================
  function bindPointer(){
    container.addEventListener("pointerdown", (e) => {
      dragging = true; dragMoved = false;
      prevX = downX = e.clientX; prevY = downY = e.clientY;
    });

    window.addEventListener("pointerup", (e) => {
      if(dragging && !dragMoved){
        handleSceneClick(e);
      }
      dragging = false;
    });

    window.addEventListener("pointermove", (e) => {
      if(!dragging) return;
      const dx = e.clientX - prevX, dy = e.clientY - prevY;
      if(Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6){
        dragMoved = true;
      }
      orbit.azimuth -= dx*0.006;
      orbit.elevation = clamp(orbit.elevation + dy*0.005, orbit.minElev, orbit.maxElev);
      prevX = e.clientX; prevY = e.clientY;
    });
  }

  function handleSceneClick(e){
    const rect = container.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    // 1. keypad always takes priority
    let hits = raycaster.intersectObjects(keypadMeshes, false);
    if(hits.length){
      const mesh = hits[0].object;
      flashKey(mesh);
      handleKey(mesh.userData.keyValue);
      return;
    }

    // 2. picking up the waiting crate
    if(pendingCrate && !pendingCrate.picked){
      hits = raycaster.intersectObject(pendingCrate.mesh, true);
      if(hits.length){
        pickUpPendingCrate();
        return;
      }
    }

    // 3. placing the crate into a highlighted empty slot
    if(pendingCrate && pendingCrate.picked && slotMarkers.length){
      hits = raycaster.intersectObjects(slotMarkers.map(s => s.mesh), false);
      if(hits.length){
        const marker = slotMarkers.find(s => s.mesh === hits[0].object);
        if(marker) placeCrateInSlot(marker.index);
      }
    }
  }

  function flashKey(mesh){
    const origZ = mesh.userData.baseZ;
    mesh.position.z = origZ - 0.03;
    setTimeout(() => { mesh.position.z = origZ; }, 120);
  }

  function onResize(){
    if(!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // =====================================================================
  // Code directory list (reference panel, unchanged behavior)
  // =====================================================================
  const chartGrid = document.getElementById("sim-chart-grid");
  if(chartGrid){
    Object.keys(VEG_MAP).forEach((key) => {
      const item = document.createElement("div");
      item.className = "veg-chart-item";
      item.innerHTML = `<span class="num">${key}</span><span class="name">${VEG_MAP[key]}</span>`;
      chartGrid.appendChild(item);
    });
  }

  // =====================================================================
  // Input state machine — code then weight. Rendered only onto the
  // in-scene screen (drawScreen); no separate DOM digits/keypad.
  // =====================================================================
  const CODE_MAX = 2, WEIGHT_MAX = 4;
  let buffer = "";
  let mode = "code";
  let pendingKey = null;

  function maxDigits(){ return mode === "weight" ? WEIGHT_MAX : CODE_MAX; }

  function resetEntry(){
    mode = "code"; pendingKey = null;
    screenState.codeLabel = "Code";
    screenState.heading = "Select a vegetable";
    screenState.sub = "Enter the code for the vegetable you'd like to store, then press Enter.";
    screenState.buffer = "";
    screenState.maxDigits = CODE_MAX;
    drawScreen();
  }

  function askWeight(key){
    mode = "weight"; pendingKey = key;
    screenState.codeLabel = "Weight (kg)";
    screenState.heading = VEG_MAP[key];
    screenState.sub = "Enter the weight being stored, in kilograms, then press Enter.";
    screenState.buffer = "";
    screenState.maxDigits = WEIGHT_MAX;
    drawScreen();
  }

  function submitCode(){
    if(buffer.length === 0) return;
    const key = String(parseInt(buffer, 10));
    buffer = "";
    if(!VEG_MAP[key]){
      screenState.heading = "Unknown code";
      screenState.sub = `No vegetable is stored under code ${key}. Check the directory on the right.`;
      screenState.buffer = "";
      drawScreen();
      return;
    }
    askWeight(key);
  }

  function submitWeight(){
    if(buffer.length === 0) return;
    const kg = parseInt(buffer, 10);
    const key = pendingKey;
    buffer = "";
    resetEntry();
    beginManualStorage(VEG_MAP[key], kg, key);
  }

  function handleKey(key){
    if(pendingCrate){
      // keypad is locked while a crate is waiting to be placed, so a
      // stray tap can't start a second order mid-placement
      return;
    }
    if(key === "backspace"){
      if(buffer.length > 0){
        buffer = buffer.slice(0, -1);
        screenState.buffer = buffer;
        drawScreen();
      } else {
        resetEntry();
      }
      return;
    }
    if(key === "enter"){
      if(mode === "weight") submitWeight(); else submitCode();
      return;
    }
    if(buffer.length < maxDigits()){
      buffer += key;
      screenState.buffer = buffer;
      drawScreen();
    }
  }

  // Physical keyboard still works as a convenience shortcut.
  document.addEventListener("keydown", (e) => {
    const page = document.getElementById("page-simulation");
    if(!page || !page.classList.contains("active")) return;
    if(/^[0-9]$/.test(e.key)) handleKey(e.key);
    else if(e.key === "Backspace") handleKey("backspace");
    else if(e.key === "Enter") handleKey("enter");
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();