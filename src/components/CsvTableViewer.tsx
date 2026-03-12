import { useState, useMemo, useRef, useCallback } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'

// ── Simple CSV/TSV parser ───────────────────────────────
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        row.push(current)
        current = ''
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current)
        current = ''
        if (row.some(c => c.trim() !== '') || row.length > 1) rows.push(row)
        row = []
        if (ch === '\r') i++
      } else {
        current += ch
      }
    }
  }
  // Last row
  row.push(current)
  if (row.some(c => c.trim() !== '') || row.length > 1) rows.push(row)
  return rows
}

// ── Main Component ──────────────────────────────────────
export default function CsvTableViewer({
  content,
  isTsv,
}: {
  content: string
  isTsv?: boolean
}) {
  const delimiter = isTsv ? '\t' : ','
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [colWidths, setColWidths] = useState<Record<number, number>>({})
  const resizingCol = useRef<number | null>(null)
  const resizeStart = useRef<{ x: number; w: number }>({ x: 0, w: 0 })

  const allRows = useMemo(() => parseCsv(content, delimiter), [content, delimiter])
  const headers = allRows[0] || []
  const dataRows = useMemo(() => allRows.slice(1), [allRows])

  const sortedRows = useMemo(() => {
    if (sortCol === null) return dataRows
    const col = sortCol
    return [...dataRows].sort((a, b) => {
      const va = a[col] || ''
      const vb = b[col] || ''
      const na = Number(va)
      const nb = Number(vb)
      if (!isNaN(na) && !isNaN(nb)) return sortAsc ? na - nb : nb - na
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [dataRows, sortCol, sortAsc])

  const handleSort = (idx: number) => {
    if (sortCol === idx) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(idx)
      setSortAsc(true)
    }
  }

  const handleResizeStart = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    resizingCol.current = colIdx
    resizeStart.current = { x: e.clientX, w: colWidths[colIdx] || 120 }

    const onMove = (ev: MouseEvent) => {
      const col = resizingCol.current
      if (col === null) return
      const delta = ev.clientX - resizeStart.current.x
      const newW = Math.max(50, resizeStart.current.w + delta)
      setColWidths(prev => ({ ...prev, [col]: newW }))
    }
    const onUp = () => {
      resizingCol.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [colWidths])

  if (allRows.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Empty file
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{
          borderCollapse: 'collapse',
          width: 'max-content',
          minWidth: '100%',
          fontSize: 12,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky',
                top: 0,
                background: 'var(--bg-tertiary, #2d2d2d)',
                padding: '6px 12px',
                textAlign: 'center',
                borderBottom: '2px solid var(--border)',
                borderRight: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 400,
                width: 40,
                minWidth: 40,
                zIndex: 2,
                userSelect: 'none',
              }}>
                #
              </th>
              {headers.map((h, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(idx)}
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-tertiary, #2d2d2d)',
                    padding: '6px 12px',
                    textAlign: 'left',
                    borderBottom: '2px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: colWidths[idx] || 'auto',
                    minWidth: colWidths[idx] || 80,
                    maxWidth: colWidths[idx] || undefined,
                    zIndex: 2,
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{h || `Col ${idx + 1}`}</span>
                    {sortCol === idx && (
                      sortAsc
                        ? <ArrowUp size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                        : <ArrowDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                    )}
                    {/* Resize handle */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, idx)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 5,
                        cursor: 'col-resize',
                        zIndex: 3,
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                style={{
                  background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(88,166,255,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
              >
                <td style={{
                  padding: '4px 12px',
                  borderBottom: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  textAlign: 'center',
                  userSelect: 'none',
                }}>
                  {rowIdx + 1}
                </td>
                {headers.map((_, colIdx) => (
                  <td
                    key={colIdx}
                    style={{
                      padding: '4px 12px',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: colWidths[colIdx] || 300,
                    }}
                    title={row[colIdx] || ''}
                  >
                    {row[colIdx] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{
        padding: '4px 12px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        background: 'var(--bg-secondary)',
      }}>
        <span>{dataRows.length} row{dataRows.length !== 1 ? 's' : ''}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span>{headers.length} column{headers.length !== 1 ? 's' : ''}</span>
        {sortCol !== null && (
          <>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>Sorted by: {headers[sortCol] || `Col ${sortCol + 1}`} ({sortAsc ? 'asc' : 'desc'})</span>
            <button
              onClick={() => setSortCol(null)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-blue, #58a6ff)', cursor: 'pointer', fontSize: 11, padding: 0 }}
            >
              Clear sort
            </button>
          </>
        )}
      </div>
    </div>
  )
}
