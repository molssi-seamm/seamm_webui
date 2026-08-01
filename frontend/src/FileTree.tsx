import type { JobFile } from './api'

export interface TreeNode {
  name: string
  path: string
  isFile: boolean
  children: TreeNode[]
}

// Builds a nested tree from the flat {path, size}[] the backend returns
// (paths use "/" separators regardless of platform -- see
// routers/jobs.py's list_job_files, which uses Path.relative_to /
// str(), always "/"-joined).
export function buildTree(files: JobFile[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let level = root
    let currentPath = ''

    parts.forEach((part, i) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isFile = i === parts.length - 1

      let node = level.find((n) => n.name === part && n.isFile === isFile)
      if (!node) {
        node = { name: part, path: currentPath, isFile, children: [] }
        level.push(node)
      }
      level = node.children
    })
  }

  sortTree(root)
  return root
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) sortTree(node.children)
}

interface TreeViewProps {
  nodes: TreeNode[]
  selected: string | null
  onSelect: (path: string) => void
}

export function TreeView({ nodes, selected, onSelect }: TreeViewProps) {
  return (
    <ul style={{ listStyle: 'none', paddingLeft: '1em', margin: 0 }}>
      {nodes.map((node) =>
        node.isFile ? (
          <li key={node.path}>
            <button
              onClick={() => onSelect(node.path)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontWeight: selected === node.path ? 'bold' : 'normal',
                textDecoration: selected === node.path ? 'underline' : 'none',
              }}
            >
              {node.name}
            </button>
          </li>
        ) : (
          <li key={node.path}>
            <details open>
              <summary style={{ cursor: 'pointer' }}>{node.name}</summary>
              <TreeView nodes={node.children} selected={selected} onSelect={onSelect} />
            </details>
          </li>
        ),
      )}
    </ul>
  )
}
