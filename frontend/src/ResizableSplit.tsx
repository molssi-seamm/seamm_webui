import { useCallback, useRef, useState } from 'react'

interface ResizableSplitProps {
  left: React.ReactNode
  right: React.ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  maxLeftWidth?: number
}

// A single drag-to-resize left/right split. Hand-rolled rather than a
// library dependency since it's one splitter, not a general layout manager.
export function ResizableSplit({
  left,
  right,
  defaultLeftWidth = 280,
  minLeftWidth = 150,
  maxLeftWidth = 600,
}: ResizableSplitProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const containerRef = useRef<HTMLDivElement>(null)

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return
      const containerLeft = container.getBoundingClientRect().left

      function onMouseMove(moveEvent: MouseEvent) {
        const newWidth = moveEvent.clientX - containerLeft
        setLeftWidth(Math.min(maxLeftWidth, Math.max(minLeftWidth, newWidth)))
      }
      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [minLeftWidth, maxLeftWidth],
  )

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'stretch' }}>
      <div style={{ width: leftWidth, flexShrink: 0, minWidth: 0 }}>{left}</div>
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        style={{
          width: '6px',
          flexShrink: 0,
          cursor: 'col-resize',
          background: 'var(--border)',
          margin: '0 4px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>{right}</div>
    </div>
  )
}
