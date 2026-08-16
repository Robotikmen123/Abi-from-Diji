export type WindowMode = 'window' | 'overlay' | 'mini';

export interface DesktopBridge {
  setMode(mode: WindowMode): Promise<WindowMode>;
  setClickThrough(enabled: boolean): Promise<boolean>;
  getState(): Promise<{ mode: WindowMode; clickThrough: boolean; desktop: boolean }>;
  quit(): Promise<void>;
}

/**
 * Masaustu kabugu koprusu. Tarayicida calisirken yok — arayuz bu durumda
 * ilgili kontrolleri hic gostermez, baska hicbir sey degismez.
 */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { abiDesktop?: DesktopBridge }).abiDesktop ?? null;
}

export function isDesktop(): boolean {
  return desktopBridge() !== null;
}
