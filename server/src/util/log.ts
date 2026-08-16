const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg: string) => console.log(`\x1b[36m[abi ${stamp()}]\x1b[0m ${msg}`),
  warn: (msg: string) => console.warn(`\x1b[33m[abi ${stamp()}]\x1b[0m ${msg}`),
  error: (msg: string, err?: unknown) => {
    console.error(`\x1b[31m[abi ${stamp()}]\x1b[0m ${msg}`);
    if (err) console.error(err);
  },
};
