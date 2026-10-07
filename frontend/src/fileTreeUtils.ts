import type { JobFile } from './api'

// Pure helpers for the job file tree (TreeView in FileTree.tsx), kept out
// of the component module so React fast refresh works for it.

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
  // Files before directories: a SEAMM job's important top-level files
  // (job.out, job_data.json, flowchart.flow) live right in the job root,
  // while numbered directories (1/, 2/, 3/, ...) are per-step working
  // directories that matter less at a glance. Numeric names also sort
  // before letters alphabetically, so files-first is what keeps this from
  // looking backwards.
  nodes.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) sortTree(node.children)
}

// Every ancestor directory of a file path, shallowest first -- e.g.
// "2/3/step.out" -> ["2", "2/3"]. Used to open the folders leading to a
// file that was picked from outside the tree (the Tasks tab's links).
export function ancestorDirs(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}
