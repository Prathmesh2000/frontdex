/** webpack and Rspack plugin: runs `frontdex watch` while the compiler watches; production builds are untouched. */
declare class FrontdexPlugin {
  constructor(options?: { enabled?: boolean });
  apply(compiler: { hooks: { watchRun: { tap(name: string, fn: () => void): void }; watchClose: { tap(name: string, fn: () => void): void } } }): void;
  static FrontdexPlugin: typeof FrontdexPlugin;
  static default: typeof FrontdexPlugin;
}
export = FrontdexPlugin;
