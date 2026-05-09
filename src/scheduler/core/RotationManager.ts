import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'data', 'rotation-state.json');

type RegionState = {
  lastSliceIndex: number;
  lastSectorIndex: number;
  lastDeepSyncDate: string;
};

type RotationState = {
  IN: RegionState;
  US: RegionState;
};

const DEFAULT_REGION_STATE: RegionState = {
  lastSliceIndex: -1,
  lastSectorIndex: -1,
  lastDeepSyncDate: ''
};

export class RotationManager {
  private static state: RotationState = {
    IN: { ...DEFAULT_REGION_STATE },
    US: { ...DEFAULT_REGION_STATE }
  };

  static init() {
    if (!fs.existsSync(path.dirname(STATE_FILE))) {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      try {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        const loaded = JSON.parse(data);
        // Migration/Safety: Ensure US/IN keys exist
        this.state = {
          IN: loaded.IN || loaded, // Fallback to old flat structure for India
          US: loaded.US || { ...DEFAULT_REGION_STATE }
        };
      } catch (e) {
        console.warn('[RotationManager] Failed to load state, using defaults.');
      }
    }
  }

  static getNextSliceIndex(region: 'IN' | 'US', totalSlices: number): number {
    const rState = this.state[region];
    rState.lastSliceIndex = (rState.lastSliceIndex + 1) % totalSlices;
    this.save();
    return rState.lastSliceIndex;
  }

  static getNextSectorIndex(region: 'IN' | 'US', totalSectors: number): number {
    const rState = this.state[region];
    const today = new Date().toISOString().split('T')[0];
    if (rState.lastDeepSyncDate !== today) {
      rState.lastSectorIndex = (rState.lastSectorIndex + 1) % totalSectors;
      rState.lastDeepSyncDate = today;
      this.save();
    }
    return rState.lastSectorIndex;
  }

  private static save() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }
}

RotationManager.init();
