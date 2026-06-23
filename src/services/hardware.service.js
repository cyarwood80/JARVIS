import si from 'systeminformation';

export let systemHardwareProfile = null;

export async function getHardwareProfile() {
    try {
        const cpu = await si.cpu();
        const mem = await si.mem();
        const graphics = await si.graphics();

        const ramGB = Math.floor(mem.total / (1024 ** 3));
        const vramGB = graphics.controllers.reduce((acc, c) => acc + (c.vram || 0), 0) / 1024;

        let tier = 'C';
        if (ramGB >= 32) tier = 'A';
        else if (ramGB >= 16) tier = 'B';

        systemHardwareProfile = {
            cpuBrand: cpu.brand,
            ramGB,
            vramGB,
            tier
        };

        return systemHardwareProfile;
    } catch (e) {
        // Fallback for safety
        systemHardwareProfile = { cpuBrand: 'Unknown', ramGB: 8, vramGB: 0, tier: 'C' };
        return systemHardwareProfile;
    }
}
