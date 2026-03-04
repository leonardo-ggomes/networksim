HUD.setPlayer(infoPlayer.name, infoPlayer.avatarUrl, infoPlayer.role)
HUD.setHealth(infoPlayer.health)         // 0–100
HUD.setEnergy(infoPlayer.energy)         // 0–100
HUD.minimap.setPlayerPos(position.x, position.z)  // no update()

HUD.minimap.addOther(id, x, z)
HUD.minimap.updateOther(id, x, z)
HUD.minimap.removeOther(id)

HUD.notify('Ninguém por perto', 'warn')
HUD.setMission('Infiltrar servidor', 'Execute o script no terminal remoto')