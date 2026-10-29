import { world, system } from "@minecraft/server";

const WRENCH = "createtrains:assembly_wrench";
const GLUE = "createtrains:assembly_glue";
const TRAIN = "createtrains:train";
const TRACK = "createtrains:track";
const SWITCH = "createtrains:track_switch";
const STATION = "createtrains:assembly_station";
const trains = new Map();
const assemblyCorners = new Map();
const SPEED = 0.12;

function horizontalDirection(player) {
  const view = player.getViewDirection();
  if (Math.abs(view.x) > Math.abs(view.z)) return { x: view.x >= 0 ? 1 : -1, z: 0 };
  return { x: 0, z: view.z >= 0 ? 1 : -1 };
}
function samePos(a,b) { return a.x===b.x && a.y===b.y && a.z===b.z; }
function trackAt(dimension, x, y, z) {
  try {
    const b = dimension.getBlock({x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)});
    return !!b && (b.typeId===TRACK || b.typeId===SWITCH);
  } catch { return false; }
}
function spawnTrain(player, location) {
  try {
    const entity = player.dimension.spawnEntity(TRAIN, location);
    const dir = horizontalDirection(player);
    trains.set(entity.id, { direction: dir, lastCell: null });
    entity.nameTag = "Locomotora Create Trains";
    player.sendMessage("§6[Create Trains] §fLocomotora creada. Sigue las vías conectadas; en cruces intentará girar si no hay vía al frente.");
    return entity;
  } catch {
    player.sendMessage("§c[Create Trains] No se pudo crear el tren. Prueba en una zona despejada.");
    return undefined;
  }
}
world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId === GLUE) {
    event.source.sendMessage("§6[Create Trains] §fPegamento de ensamblaje: receta añadida. En esta versión todavía no pega ni convierte bloques en un tren; úsalo como objeto experimental mientras se desarrolla el ensamblador.");
    return;
  }
  if (event.itemStack?.typeId !== WRENCH) return;
  const player = event.source;
  const dir = horizontalDirection(player);
  spawnTrain(player, {
    x: Math.floor(player.location.x + dir.x * 2) + 0.5,
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z + dir.z * 2) + 0.5
  });
});

// Wrench on the assembly station spawns a test locomotive. Wrench on ordinary blocks
// records two corners of a proposed train build and reports its size; the blocks remain
// untouched as a safety measure because Bedrock Script API cannot turn arbitrary blocks
// into a custom moving entity with their exact block geometry using this simple pack.
world.afterEvents.itemUseOn.subscribe((event) => {
  if (event.itemStack?.typeId !== WRENCH) return;
  const player = event.source;
  const b = event.block;
  if (b.typeId === STATION) {
    const p = b.location;
    spawnTrain(player, { x:p.x+0.5, y:p.y+1, z:p.z+0.5 });
    return;
  }
  if (b.typeId === TRACK || b.typeId === SWITCH) return;
  const key = player.id;
  const p = {x:b.location.x,y:b.location.y,z:b.location.z};
  const first = assemblyCorners.get(key);
  if (!first) {
    assemblyCorners.set(key,p);
    player.sendMessage("§e[Create Trains] Primera esquina guardada. Toca con la llave un bloque de la esquina opuesta de tu locomotora/vagón.");
    return;
  }
  assemblyCorners.delete(key);
  const min = {x:Math.min(first.x,p.x),y:Math.min(first.y,p.y),z:Math.min(first.z,p.z)};
  const max = {x:Math.max(first.x,p.x),y:Math.max(first.y,p.y),z:Math.max(first.z,p.z)};
  let count=0, sample=[];
  const volume=(max.x-min.x+1)*(max.y-min.y+1)*(max.z-min.z+1);
  if (volume>4096) {
    player.sendMessage("§c[Create Trains] Selección demasiado grande (máximo 4096 posiciones).");
    return;
  }
  try {
    for(let x=min.x;x<=max.x;x++) for(let y=min.y;y<=max.y;y++) for(let z=min.z;z<=max.z;z++) {
      const block=player.dimension.getBlock({x,y,z});
      if(block && block.typeId!=="minecraft:air" && block.typeId!=="minecraft:cave_air" && block.typeId!=="minecraft:void_air") {
        count++; if(sample.length<5) sample.push(block.typeId);
      }
    }
    player.sendMessage("§6[Create Trains] §fSelección detectada: "+count+" bloques. Aún no se convierte en un tren móvil: esta herramienta solo mide el diseño y deja los bloques intactos. Para convertir bloques arbitrarios en un modelo móvil se necesita un sistema de estructuras/modelos más avanzado.");
  } catch {
    player.sendMessage("§c[Create Trains] No pude leer esa selección. Prueba con un área más pequeña.");
  }
});

function chooseNextDirection(dimension, pos, state) {
  const y=Math.floor(pos.y-1);
  const x=Math.floor(pos.x), z=Math.floor(pos.z);
  const d=state.direction;
  const candidates=[
    d,
    {x:-d.z,z:d.x},
    {x:d.z,z:-d.x},
    {x:-d.x,z:-d.z}
  ];
  // Keep moving straight whenever possible; at a bend or junction choose a connected
  // neighboring track. Prefer a non-reversing direction and avoid immediate backtracking.
  for(let i=0;i<candidates.length;i++) {
    const c=candidates[i];
    if(trackAt(dimension,x+c.x,y,z+c.z)) return c;
  }
  return null;
}
system.runInterval(() => {
  for (const dimension of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
    for (const entity of dimension.getEntities({ type: TRAIN })) {
      let state = trains.get(entity.id);
      if (!state) { state={direction:{x:0,z:1},lastCell:null}; trains.set(entity.id,state); }
      const pos=entity.location;
      const cell={x:Math.floor(pos.x),y:Math.floor(pos.y-1),z:Math.floor(pos.z)};
      if(!trackAt(dimension,cell.x,cell.y,cell.z)) continue;
      const dir=chooseNextDirection(dimension,pos,state);
      if(!dir) continue;
      state.direction=dir;
      const nx=pos.x+dir.x*SPEED, nz=pos.z+dir.z*SPEED;
      const ny=Math.floor(pos.y-1);
      if(!trackAt(dimension,nx,ny,nz)) continue;
      try {
        entity.teleport({x:nx,y:pos.y,z:nz},{dimension,rotation:{x:0,y:dir.x>0?90:dir.x<0?-90:dir.z>0?0:180}});
      } catch {}
    }
  }
},2);
world.afterEvents.entityDie.subscribe((event) => { trains.delete(event.deadEntity.id); });
