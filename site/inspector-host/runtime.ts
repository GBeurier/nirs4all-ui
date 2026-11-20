// Explicit host runtime selection. Owners retain training, selection and numerical work.
let dagPromise: Promise<unknown> | undefined
let methodsPromise: Promise<unknown> | undefined
export function loadDagMlWasm() {
  return dagPromise ??= import('dag-ml-wasm').then(async module => { await module.default(); return module })
}
export function loadMethodsWasm() {
  return methodsPromise ??= import('@nirs4all/methods').then(async module => { await module.loadModule(); return module })
}
