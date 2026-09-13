(function(){

  // =====================================================================
  // Rack dimensions — 5 (x) × 3 (y) × 4 (z) = 60 crates total.
  // =====================================================================
  const GRID = { x: 5, y: 4, z: 3 };

  const CUBE_SIZE = 1;
  const GAP = 0.35;
  const STEP = CUBE_SIZE + GAP;

  // Persists the "already occupied" list ACROSS PAGE REFRESHES ONLY — it's
  // reset back to empty whenever the backend process itself restarts (see
  // the session-id check inside crateData() below).
  const OCCUPIED_STORAGE_KEY = "cryovault_occupied_crates";
  const SESSION_STORAGE_KEY = "cryovault_backend_session_id";

  // Backend's /sendCrate returns raw [x, y, z] tuples (straight from the
  // `allocate` list in Flask). The renderer below works with {x,y,z}
  // objects, so convert once here.
  function toCoordObjects(tuples){
    return (tuples || []).map(([x, y, z]) => ({ x, y, z }));
  }

  function loadPersistedOccupied(){
    try{
      const raw = localStorage.getItem(OCCUPIED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(err){
      console.error("Failed to read persisted occupied crates:", err);
      return [];
    }
  }

  function savePersistedOccupied(list){
    try{
      localStorage.setItem(OCCUPIED_STORAGE_KEY, JSON.stringify(list));
    }catch(err){
      console.error("Failed to persist occupied crates:", err);
    }
  }

  // =====================================================================
  // Two independent lists decide what each cell looks like:
  //  - justOccupied: lights up GREEN (allocated on this call)
  //  - occupied:     renders as a solid BLACK box (allocated previously)
  // Anything in neither list stays an empty wireframe outline.
  // =====================================================================
  let justOccupied = [];
  let occupied = loadPersistedOccupied();

  // Checked on its own, via an endpoint that can never fail the way
  // /sendCrate can (that one 500s if /send_time hasn't been called yet,
  // e.g. right after a restart — which would otherwise skip this check
  // entirely). The backend hands back a fresh random session_id every
  // time the Flask process starts. If the id we see now doesn't match the
  // one we saved last time, the backend just restarted, so our persisted
  // `occupied` list is stale and must be wiped, not carried forward.
  async function checkBackendSession(){
    try{
      const response = await fetch("/session_id");
      if(!response.ok) throw new Error(`session_id failed (${response.status})`);
      const data = await response.json();
      const backendSessionId = data.session_id;
      const lastSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
      if(backendSessionId && backendSessionId !== lastSessionId){
        console.log("Backend restarted — resetting occupied crates to empty.");
        occupied = [];
        savePersistedOccupied(occupied);
        localStorage.setItem(SESSION_STORAGE_KEY, backendSessionId);
      }
    }catch(err){
      console.error("Could not check backend session id:", err);
    }
  }

  async function crateData(){
    console.log("enter crate data...");
    try{
      const response = await fetch("/sendCrate");
      if(!response.ok) throw new Error(`sendCrate failed (${response.status})`);
      const data = await response.json();
      justOccupied = toCoordObjects(data.occupied_boxes);
      console.log(justOccupied);
    }catch(err){
      console.error(err);
      justOccupied = [];
    }
  }

  function buildAllocationData(){
    return {
      glowing: justOccupied,
      occupiedBlack: occupied
    };
  }

  function isInList(x, y, z, list){
    return list.some(c => c.x === x && c.y === y && c.z === z);
  }

  // =====================================================================
  // Three.js scene: a grid of small cubes.
  //  - Glowing crates  -> solid emissive-green box + soft point light
  //  - Occupied-black  -> solid black box, no glow
  //  - Empty crates    -> visible teal wireframe outline
  // =====================================================================
  let renderer = null;
  let container = null;

  function init(){
    container = document.getElementById("cube-scene");
    if(!container || typeof THREE === "undefined") return;

    // Clear out any previous render, in case init() runs more than once
    // (e.g. re-rendering after a new allocation comes in).
    container.innerHTML = "";

    const data = buildAllocationData();

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(8.5, 6.5, 10.5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x2c3a34, 1.3));
    const keyLight = new THREE.DirectionalLight(0xdfffe9, 0.45);
    keyLight.position.set(6, 10, 8);
    scene.add(keyLight);

    const rig = new THREE.Group();
    scene.add(rig);

    const offsetX = ((GRID.x - 1) * STEP) / 2;
    const offsetY = ((GRID.y - 1) * STEP) / 2;
    const offsetZ = ((GRID.z - 1) * STEP) / 2;

    const boxGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    const emptyEdgeMat = new THREE.LineBasicMaterial({ color: 0x3DBFA0, transparent: true, opacity: 0.65 });
    const glowEdgeMat = new THREE.LineBasicMaterial({ color: 0xDFFFE9 });
    const blackEdgeMat = new THREE.LineBasicMaterial({ color: 0x9AA8A2, transparent: true, opacity: 0.8 });

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x2ecc82,
      emissive: 0x4ffab0,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.85,
      roughness: 0.35,
      metalness: 0.1
    });

    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x0A0A0A,
      roughness: 0.5,
      metalness: 0.2
    });

    for(let x = 0; x < GRID.x; x++){
      for(let y = 0; y < GRID.y; y++){
        for(let z = 0; z < GRID.z; z++){
          const px = x * STEP - offsetX;
          const py = y * STEP - offsetY;
          const pz = z * STEP - offsetZ;

          const glow = isInList(x, y, z, data.glowing);
          const occupiedBlack = !glow && isInList(x, y, z, data.occupiedBlack);

          let edgeMat = emptyEdgeMat;
          if(glow) edgeMat = glowEdgeMat;
          else if(occupiedBlack) edgeMat = blackEdgeMat;

          const edges = new THREE.LineSegments(edgesGeo, edgeMat);
          edges.position.set(px, py, pz);
          rig.add(edges);

          if(glow){
            const mesh = new THREE.Mesh(boxGeo, glowMat);
            mesh.position.set(px, py, pz);
            rig.add(mesh);

            const light = new THREE.PointLight(0x8fe3b8, 1.2, 3.2);
            light.position.set(px, py, pz);
            rig.add(light);
          } else if(occupiedBlack){
            const mesh = new THREE.Mesh(boxGeo, blackMat);
            mesh.position.set(px, py, pz);
            rig.add(mesh);
          }
        }
      }
    }

    // Drag-to-rotate, auto-spin when idle.
    let dragging = false;
    let prevX = 0, prevY = 0;

    container.addEventListener("pointerdown", (e) => {
      dragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });
    window.addEventListener("pointerup", () => { dragging = false; });
    window.addEventListener("pointermove", (e) => {
      if(!dragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      rig.rotation.y += dx * 0.006;
      rig.rotation.x += dy * 0.006;
      prevX = e.clientX;
      prevY = e.clientY;
    });

    function animate(){
      requestAnimationFrame(animate);
      if(!dragging){
        rig.rotation.y += 0.0025;
      }
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener("resize", () => {
      if(!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  // Fetches the latest allocation from the backend, folds it into the
  // persisted "occupied" list (proper array merge, not the old `+` bug),
  // and (re)renders the rack. If crateData() detected a backend restart,
  // `occupied` will already have been reset to [] before this runs.
  async function refreshAllocation(){
    await checkBackendSession();
    await crateData();

    occupied = occupied.concat(justOccupied);
    savePersistedOccupied(occupied);

    init();

    // Reset after init() has already used justOccupied to build the scene.
    justOccupied = [];
  }

  // Expose this so other scripts (e.g. the terminal keypad flow) can
  // trigger a re-render after a new vegetable/weight is submitted:
  //   window.CryoVaultAllocation.refresh();
  window.CryoVaultAllocation = { refresh: refreshAllocation };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", refreshAllocation);
  }else{
    refreshAllocation();
  }

})();