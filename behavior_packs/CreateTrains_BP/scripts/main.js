import { world } from "@minecraft/server";

const ITEM_ID = "createtrains:assembly_wrench";
const TRAIN_ID = "createtrains:train";

world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId !== ITEM_ID) return;
  const player = event.source;
  const direction = player.getViewDirection();
  const location = player.location;
  const spawnAt = { x: location.x + direction.x * 2, y: location.y, z: location.z + direction.z * 2 };
  try {
    player.dimension.spawnEntity(TRAIN_ID, spawnAt);
    player.sendMessage("§6[Create Trains] §fLocomotora de prueba creada. El ensamblaje de bloques y las vías aún no están implementados.");
  } catch {
    player.sendMessage("§c[Create Trains] No se pudo crear la locomotora aquí. Prueba en una zona despejada.");
  }
});
