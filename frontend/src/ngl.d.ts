// ngl@0.10.4 ships no TypeScript declarations (types were only added in much
// later major versions -- see StructureViewer.tsx's comment on why we're
// pinned to this old release). Minimal ambient shim for what we use.
declare module 'ngl' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class Stage {
    constructor(element: HTMLElement | string, params?: Record<string, unknown>)
    loadFile(path: string, params?: Record<string, unknown>): Promise<any>
    handleResize(): void
    dispose(): void
  }
}
