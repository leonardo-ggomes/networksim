export const roles = {
    PLAYER:    'player',
    PRESENTER: 'presenter',
    MODERATOR: 'moderator',
    ADMIN:     'admin',
    GUEST:     'guest'
};

// ── infoPlayer reativo ────────────────────────────────────────────────────────
// Qualquer atribuição em money, energy ou health dispara automaticamente
// o método correspondente no HUD (window.HUD), sem precisar chamar manualmente.
//
// Uso:
//   infoPlayer.money  = 1500   → HUD.setMoney(1500)   automaticamente
//   infoPlayer.energy = 80     → HUD.setEnergy(80)    automaticamente
//   infoPlayer.health = 60     → HUD.setHealth(60)    automaticamente

const _raw = {
    money:          0,
    energy:         100,
    health:         100,
    hasTerminal:    false,
    toggleDrone :  true,
    id:             '',
    role:           'player',
    isRadialMenuActive: false,
};

function syncHUD(key: string, value: number) {
    const hud = (window as any).HUD;
    if (!hud) return;
    switch (key) {
        case 'money':  hud.setMoney?.(value);  break;
        case 'energy': hud.setEnergy?.(value); break;
        case 'health': hud.setHealth?.(value); break;
    }
}

export const infoPlayer = new Proxy(_raw, {
    set(target, prop, value) {
        (target as any)[prop] = value;
        if (prop === 'money' || prop === 'energy' || prop === 'health') {
            syncHUD(prop as string, value as number);
        }
        // Atualiza o balanço e barras da loja sempre que vitais ou money mudam
        if (prop === 'money' || prop === 'energy' || prop === 'health') {
            (window as any).Phone?.refreshShop?.();
        }
        return true;
    }
});

// Expõe globalmente para o Phone.js acessar sem import circular
(window as any).infoPlayer = infoPlayer;

export const Auditorio = {
    chairs: [""]
}

export const othersPlayers = {
    collideId: ''
}