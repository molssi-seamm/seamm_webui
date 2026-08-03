import { useEffect, useRef, useState } from 'react'
import { Stage } from 'ngl'

interface StructureViewerProps {
  url: string
  ext: string
}

// Matches the old dashboard's loadStructure() (job_report.js): an NGL Stage
// loading directly from the file's download URL, default representation
// plus the unit cell if the structure has one, camera auto-fit, and (when
// the file has more than one model/structure, e.g. a multi-record SDF) a
// selector to step through them one at a time -- otherwise every model
// renders overlaid in the same 3D space at once. The representation-style/
// image-export menus from the old dashboard are still an explicit follow-up.
//
// Pinned to ngl@0.10.4 (matching the version the OLD dashboard's
// package.json already pins and has run successfully against these same
// real files for years) rather than the latest 2.x release: the latest
// version has real regressions confirmed via a real headless-browser
// repro -- its CIF parser throws on any CIF at all (even a trivial 2-atom
// synthetic file, isolated completely from our own code and from SEAMM's
// files), and it also crashes constructing a StructureComponent for some
// real, more complex production SDF files. 0.10.4 handles all of these
// correctly. Ships no TypeScript declarations (see ngl.d.ts's minimal
// ambient shim), so components are duck-typed (component.structure) rather
// than a typed `Component` union the 2.x typings would allow.
export function StructureViewer({ url, ext }: StructureViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const componentRef = useRef<any>(null)
  const [numModels, setNumModels] = useState(1)
  const [modelIndex, setModelIndex] = useState(1)

  useEffect(() => {
    // Captured as a local, not read again via containerRef.current in the
    // cleanup below: React nulls ref.current for an unmounting instance
    // before/while running effect cleanups (confirmed via a real
    // headless-browser run -- containerRef.current was already undefined
    // inside cleanup), so an `if (containerRef.current)` guard there was
    // silently never firing, which is why canvases from React StrictMode's
    // dev-mode mount/cleanup/remount cycle kept accumulating.
    const container = containerRef.current
    if (!container) return

    const stage = new Stage(container, { backgroundColor: 'white' })

    stage
      .loadFile(url, { ext, defaultRepresentation: false })
      .then((component) => {
        if (!component || !component.structure) return
        componentRef.current = component

        component.addRepresentation('ball+stick', {})
        // Not every structure has a unit cell (e.g. a single non-periodic
        // molecule) -- addRepresentation('unitcell') throws when there is
        // none, which would also skip autoView() below since both calls
        // were in this same .then().
        if (component.structure.unitcell) {
          component.addRepresentation('unitcell', {})
        }

        const count = component.structure.modelStore?.count ?? 1
        setNumModels(count)
        if (count > 1) {
          component.setSelection('/0')
        }
        component.autoView()
      })
      .catch((err: unknown) => {
        console.error('Failed to load structure', err)
      })

    function handleResize() {
      stage.handleResize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      stage.dispose()
      // stage.dispose() does not reliably remove the <canvas> it created
      // from the DOM -- without this, leftover canvases stack up (two
      // <canvas> elements, one visibly pushing the real one far down the
      // page, confirmed via a real headless-browser run).
      if (container) {
        container.innerHTML = ''
      }
      componentRef.current = null
    }
  }, [url, ext])

  useEffect(() => {
    setModelIndex(1)
    setNumModels(1)
  }, [url, ext])

  function selectModel(index: number) {
    setModelIndex(index)
    componentRef.current?.setSelection(`/${index - 1}`)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {numModels > 1 && (
        <p style={{ flexShrink: 0 }}>
          Structure{' '}
          <button
            onClick={() => selectModel(Math.max(1, modelIndex - 1))}
            disabled={modelIndex <= 1}
          >
            &larr;
          </button>{' '}
          <input
            type="number"
            min={1}
            max={numModels}
            value={modelIndex}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isInteger(v) && v >= 1 && v <= numModels) selectModel(v)
            }}
            style={{ width: '4em' }}
          />{' '}
          <button
            onClick={() => selectModel(Math.min(numModels, modelIndex + 1))}
            disabled={modelIndex >= numModels}
          >
            &rarr;
          </button>{' '}
          of {numModels}
        </p>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          flex: 1,
          minHeight: 0,
          border: '1px solid var(--border)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
