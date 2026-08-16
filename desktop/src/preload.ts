import { contextBridge, ipcRenderer } from 'electron';

/**
 * Arayuze acilan tek kopru. Node erisimi verilmiyor; sadece pencere modu,
 * tiklama gecirgenligi ve kapanma.
 */
contextBridge.exposeInMainWorld('abiDesktop', {
  setMode: (mode: 'window' | 'overlay' | 'mini') => ipcRenderer.invoke('abi:mode', mode),
  setClickThrough: (enabled: boolean) => ipcRenderer.invoke('abi:click-through', enabled),
  getState: () => ipcRenderer.invoke('abi:state'),
  quit: () => ipcRenderer.invoke('abi:quit'),
});
