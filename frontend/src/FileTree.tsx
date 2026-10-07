import type { TreeNode } from './fileTreeUtils'

interface TreeViewProps {
  nodes: TreeNode[]
  selected: string | null
  onSelect: (path: string) => void
  // Directories start closed (a large job has hundreds of step
  // directories), so the user drills down level by level. The open set is
  // owned by the caller rather than left to each <details> element, so it
  // survives the Files/Tasks tab switch and so "Close all" can reset it.
  openDirs: Set<string>
  onToggleDir: (path: string, open: boolean) => void
}

export function TreeView({ nodes, selected, onSelect, openDirs, onToggleDir }: TreeViewProps) {
  return (
    <ul
      style={{
        listStyle: 'none',
        paddingLeft: '1.25em',
        margin: 0,
        fontFamily: 'var(--mono)',
        fontSize: '14px',
        textAlign: 'left',
      }}
    >
      {nodes.map((node) => {
        if (node.isFile) {
          return (
            <li key={node.path}>
              <button
                onClick={() => onSelect(node.path)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 0',
                  textAlign: 'left',
                  width: '100%',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: selected === node.path ? 'var(--accent)' : 'inherit',
                  fontWeight: selected === node.path ? 'bold' : 'normal',
                }}
              >
                {node.name}
              </button>
            </li>
          )
        }
        const isOpen = openDirs.has(node.path)
        return (
          <li key={node.path}>
            <details
              open={isOpen}
              onToggle={(e) => {
                // Also fires when React itself sets `open` (e.g. Close
                // all); only report real changes, so that is a no-op.
                const nowOpen = e.currentTarget.open
                if (nowOpen !== isOpen) onToggleDir(node.path, nowOpen)
              }}
            >
              <summary style={{ cursor: 'pointer', padding: '2px 0' }}>{node.name}</summary>
              {/* Children are only rendered while open -- keeps a big
                  job's tree cheap until the user actually drills in. */}
              {isOpen && (
                <TreeView
                  nodes={node.children}
                  selected={selected}
                  onSelect={onSelect}
                  openDirs={openDirs}
                  onToggleDir={onToggleDir}
                />
              )}
            </details>
          </li>
        )
      })}
    </ul>
  )
}
