import { world, system } from "@minecraft/server";

const WRENCH = "createtrains:assembly_wrench";
const TRAIN = "createtrains:train";
const TRACK = "createtrains:track";
const STATION = "createtrains:assembly_station";

// In-memory movement state. Trains only move while the block below them is track.
const trains = new Map();
const SPEED = 0.12;

function horizontalDirection(player) {
  const view = player.getViewDirection();
  const ax = Math.abs(view.x), az = Math.abs(view.z);
  if (ax > az) return { x: view.x >= 0 ? 1 : -1, z: 0 };
  return { x: 0, z: view.z >= 0 ? 1 : -1 };
}

function spawnTrain(player, location) {
  try {
    const entity = player.dimension.spawnEntity(TRAIN, location);
    const dir = horizontalDirection(player);
    trains.set(entity.id, { direction: dir, moving: true });
    entity.nameTag = "Locomotora Create Trains";
    player.sendMessage("§6[Create Trains] §fLocomotora creada. Coloca vías en línea recta debajo de ella para que avance.");
    return entity;
  } catch (e) {
    player.sendMessage("§c[Create Trains] No se pudo crear el tren. Prueba en una zona despejada.");
    return undefined;
  }
}

// The wrench creates a test locomotive in front of the player.
world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId !== WRENCH) return;
  const player = event.source;
  const dir = horizontalDirection(player);
  spawnTrain(player, {
    x: Math.floor(player.location.x + dir.x * 2) + 0.5,
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z + dir.z * 2) + 0.5
  });
});

// Using the wrench on the assembly station also creates the locomotive there.
world.afterEvents.itemUseOn.subscribe((event) => {
  if (event.itemStack?.typeId !== WRENCH) return;
  if (event.block.typeId !== STATION) return;
  const p = event.source;
  const b = event.block.location;
  spawnTrain(p, { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 });
});

// Very simple straight-track movement prototype. Turns and switches are not implemented yet.
system.runInterval(() => {
  for (const dimension of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
    for (const entity of dimension.getEntities({ type: TRAIN })) {
      let state = trains.get(entity.id);
      if (!state) {
        state = { direction: { x: 0, z: 1 }, moving: true };
        trains.set(entity.id, state);
      }
      const pos = entity.location;
      const below = dimension.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y - 1), z: Math.floor(pos.z) });
      if (!below || below.typeId !== TRACK) continue;
      const nextX = pos.x + state.direction.x * SPEED;
      const nextZ = pos.z + state.direction.z * SPEED;
      const nextTrack = dimension.getBlock({ x: Math.floor(nextX), y: Math.floor(pos.y - 1), z: Math.floor(nextZ) });
      if (!nextTrack || nextTrack.typeId !== TRACK) continue;
      try {
        entity.teleport({ x: nextX, y: pos.y, z: nextZ }, { dimension, rotation: { x: 0, y: state.direction.x > 0 ? 90 : state.direction.x < 0 ? -90 : state.direction.z > 0 ? 0 : 180 } });
      } catch {}
    }
  }
}, 2);

world.afterEvents.entityDie.subscribe((event) => {
  trains.delete(event.deadEntity.id);
});
