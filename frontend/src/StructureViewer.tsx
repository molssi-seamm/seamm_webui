import { useEffect, useRef } from 'react'
import { Stage } from 'ngl'

interface StructureViewerProps {
  url: string
  ext: string
}

// Matches the old dashboard's loadStructure() (job_report.js): an NGL Stage
// loading directly from the file's download URL, default representation
// plus the unit cell if the structure has one, camera auto-fit. Multi-model
// navigation and the representation-style/image-export menus are explicit
// follow-ups, not done here -- this covers "see the structure at all",
// which is the actual gap being filled.
export function StructureViewer({ url, ext }: StructureViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const stage = new Stage(containerRef.current, { backgroundColor: 'white' })

    stage
      .loadFile(url, { ext, defaultRepresentation: true })
      .then((component) => {
        if (!component) return
        component.addRepresentation('unitcell', {})
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
    }
  }, [url, ext])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '75vh',
        border: '1px solid var(--border)',
      }}
    />
  )
}
