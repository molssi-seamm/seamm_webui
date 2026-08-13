import { useEffect, useRef, type ReactNode } from 'react'
import { FilterIcon } from './icons'

// A column header's label + filter icon + popover, Excel-style. The icon
// is highlighted when `active` (that column currently has a filter
// applied), so a filtered table is discoverable at a glance without
// opening anything. Purely presentational -- JobsPage owns which column's
// popover is open (only one at a time) and what's inside it.
export function ColumnFilter({
  label,
  active,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string
  active: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  return (
    <span className="col-filter" ref={ref}>
      {label}
      <button
        type="button"
        className={`col-filter-btn${active ? ' active' : ''}`}
        onClick={onToggle}
        title={active ? `${label} is filtered -- click to change` : `Filter by ${label}`}
      >
        <FilterIcon className="col-filter-icon" />
      </button>
      {open && <div className="col-filter-popover">{children}</div>}
    </span>
  )
}

// The single-select-list content shared by Status/Queue/Project's
// popovers: a plain button per option (not radios/a <select> -- one click
// both picks the value and closes the popover, matching Excel's own
// single-click-to-filter list feel more than a form control would).
export function FilterOptionList({
  allLabel,
  value,
  options,
  onSelect,
}: {
  allLabel: string
  value: string
  options: string[]
  onSelect: (value: string) => void
}) {
  return (
    <ul className="col-filter-list">
      <li>
        <button
          type="button"
          className={value === '' ? 'selected' : ''}
          onClick={() => onSelect('')}
        >
          {allLabel}
        </button>
      </li>
      {options.map((option) => (
        <li key={option}>
          <button
            type="button"
            className={value === option ? 'selected' : ''}
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        </li>
      ))}
    </ul>
  )
}
