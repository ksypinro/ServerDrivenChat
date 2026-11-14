// Holds one lock in a separate process until killed: node lock-holder.mjs <module> <export> ...arguments
const [, , modulePath, exportName, ...args] = process.argv;
const lock = await (await import(modulePath))[exportName](...args);
process.stdout.write(lock ? 'held\n' : 'busy\n');
setInterval(() => {}, 60_000);
