import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, Minus, Square, X, Zap } from 'lucide-react'
import { useFileStore } from '@/store/files'
import { useEditorStore } from '@/store/editor'
import { useRecentFilesStore } from '@/store/recentFiles'

/* ------------------------------------------------------------------ */
/*  Menu definitions                                                   */
/* ------------------------------------------------------------------ */

type MenuItem =
  | { type: 'action'; label: string; shortcut?: string; action: () => void }
  | { type: 'submenu'; label: string; children: MenuItem[] }
  | { type: 'separator' }

type MenuDef = { label: string; items: MenuItem[] }

function buildMenus(
  fileStore: ReturnType<typeof useFileStore>,
  editorStore: ReturnType<typeof useEditorStore>,
  recentFiles: { path: string; name: string }[],
): MenuDef[] {
  /* ---------- helpers ------------------------------------------------ */
  const saveActiveFile = () => {
    const active = editorStore.openFiles.find(
      (f) => f.path === editorStore.activeFilePath,
    )
    if (active && active.path) {
      window.api?.saveFile?.(active.path, active.content)
    }
  }

  const saveAllFiles = () => {
    editorStore.openFiles.forEach((f) => {
      if (f.isModified && f.path) {
        window.api?.saveFile?.(f.path, f.content)
      }
    })
  }

  const dispatch = (name: string, detail?: unknown) =>
    window.dispatchEvent(detail ? new CustomEvent(name, { detail }) : new Event(name))

  /* ---------- recent files submenu ----------------------------------- */
  const recentFilesItems: MenuItem[] =
    recentFiles.length > 0
      ? [
          ...recentFiles.map((f) => ({
            type: 'action' as const,
            label: f.name,
            action: () => dispatch('orion:open-recent-file', { path: f.path, name: f.name }),
          })),
          { type: 'separator' as const },
          {
            type: 'action' as const,
            label: 'Clear Recently Opened',
            action: () => useRecentFilesStore.getState().clearRecent(),
          },
        ]
      : [
          {
            type: 'action' as const,
            label: '(No Recent Files)',
            action: () => {},
          },
        ]

  /* ---------- menus -------------------------------------------------- */
  return [
    /* ======================== File ======================== */
    {
      label: 'File',
      items: [
        {
          type: 'action',
          label: 'New File',
          shortcut: 'Ctrl+N',
          action: () => {
            const untitled = `untitled-${Date.now()}`
            editorStore.openFile({
              path: untitled,
              name: 'Untitled',
              content: '',
              language: 'plaintext',
              isModified: false,
            })
          },
        },
        {
          type: 'action',
          label: 'New Window',
          shortcut: 'Ctrl+Shift+N',
          action: () => dispatch('orion:new-window'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Open Folder...',
          shortcut: 'Ctrl+O',
          action: () => window.api?.openFolder?.(),
        },
        {
          type: 'submenu',
          label: 'Open Recent',
          children: recentFilesItems,
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Save',
          shortcut: 'Ctrl+S',
          action: saveActiveFile,
        },
        {
          type: 'action',
          label: 'Save As...',
          shortcut: 'Ctrl+Shift+S',
          action: () => dispatch('orion:save-file-as'),
        },
        {
          type: 'action',
          label: 'Save All',
          action: saveAllFiles,
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Revert File',
          action: () => dispatch('orion:revert-file'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Close Tab',
          shortcut: 'Ctrl+W',
          action: () => dispatch('orion:close-tab'),
        },
        {
          type: 'action',
          label: 'Close All Tabs',
          action: () => dispatch('orion:close-all-tabs'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Auto Save',
          action: () => dispatch('orion:toggle-auto-save'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Preferences: Settings',
          shortcut: 'Ctrl+,',
          action: () => dispatch('orion:open-settings'),
        },
        {
          type: 'action',
          label: 'Preferences: Keyboard Shortcuts',
          shortcut: 'Ctrl+K Ctrl+S',
          action: () => dispatch('orion:keyboard-shortcuts'),
        },
        {
          type: 'action',
          label: 'Preferences: Color Theme',
          action: () => dispatch('orion:open-palette'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Exit',
          shortcut: 'Alt+F4',
          action: () => window.api?.close?.(),
        },
      ],
    },
    /* ======================== Edit ======================== */
    {
      label: 'Edit',
      items: [
        {
          type: 'action',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => dispatch('orion:undo'),
        },
        {
          type: 'action',
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => dispatch('orion:redo'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Cut',
          shortcut: 'Ctrl+X',
          action: () => document.execCommand('cut'),
        },
        {
          type: 'action',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          action: () => document.execCommand('copy'),
        },
        {
          type: 'action',
          label: 'Paste',
          shortcut: 'Ctrl+V',
          action: () => navigator.clipboard.readText().then((t) => document.execCommand('insertText', false, t)).catch(() => {}),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Find',
          shortcut: 'Ctrl+F',
          action: () => dispatch('orion:editor-find'),
        },
        {
          type: 'action',
          label: 'Replace',
          shortcut: 'Ctrl+H',
          action: () => dispatch('orion:editor-replace'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Find in Files',
          shortcut: 'Ctrl+Shift+F',
          action: () => dispatch('orion:show-search'),
        },
      ],
    },
    /* ======================== Selection ======================== */
    {
      label: 'Selection',
      items: [
        {
          type: 'action',
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: () => document.execCommand('selectAll'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Expand Selection',
          shortcut: 'Shift+Alt+Right',
          action: () => dispatch('orion:expand-selection'),
        },
        {
          type: 'action',
          label: 'Shrink Selection',
          shortcut: 'Shift+Alt+Left',
          action: () => dispatch('orion:shrink-selection'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Add Cursor Above',
          shortcut: 'Ctrl+Alt+Up',
          action: () => dispatch('orion:add-cursor-above'),
        },
        {
          type: 'action',
          label: 'Add Cursor Below',
          shortcut: 'Ctrl+Alt+Down',
          action: () => dispatch('orion:add-cursor-below'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Select All Occurrences',
          shortcut: 'Ctrl+Shift+L',
          action: () => dispatch('orion:select-all-occurrences'),
        },
        {
          type: 'action',
          label: 'Add Next Occurrence',
          shortcut: 'Ctrl+D',
          action: () => dispatch('orion:add-selection-next-match'),
        },
      ],
    },
    /* ======================== View ======================== */
    {
      label: 'View',
      items: [
        {
          type: 'action',
          label: 'Command Palette',
          shortcut: 'Ctrl+Shift+P',
          action: () => dispatch('orion:open-palette'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Explorer',
          shortcut: 'Ctrl+Shift+E',
          action: () => dispatch('orion:show-explorer'),
        },
        {
          type: 'action',
          label: 'Search',
          shortcut: 'Ctrl+Shift+F',
          action: () => dispatch('orion:show-search'),
        },
        {
          type: 'action',
          label: 'Source Control',
          shortcut: 'Ctrl+Shift+G',
          action: () => dispatch('orion:show-git'),
        },
        {
          type: 'action',
          label: 'Extensions',
          shortcut: 'Ctrl+Shift+X',
          action: () => dispatch('orion:show-extensions'),
        },
        { type: 'separator' },
        {
          type: 'submenu',
          label: 'Appearance',
          children: [
            {
              type: 'action',
              label: 'Zen Mode',
              shortcut: 'Ctrl+K Z',
              action: () => dispatch('orion:zen-mode'),
            },
            {
              type: 'action',
              label: 'Toggle Full Screen',
              shortcut: 'F11',
              action: () => dispatch('orion:toggle-fullscreen'),
            },
            { type: 'separator' },
            {
              type: 'action',
              label: 'Toggle Status Bar',
              action: () => dispatch('orion:toggle-statusbar'),
            },
            {
              type: 'action',
              label: 'Toggle Activity Bar',
              action: () => dispatch('orion:toggle-activitybar'),
            },
            {
              type: 'action',
              label: 'Toggle Sidebar',
              shortcut: 'Ctrl+B',
              action: () => dispatch('orion:toggle-sidebar'),
            },
            {
              type: 'action',
              label: 'Toggle Panel',
              shortcut: 'Ctrl+J',
              action: () => dispatch('orion:toggle-panel'),
            },
          ],
        },
        {
          type: 'submenu',
          label: 'Editor Layout',
          children: [
            {
              type: 'action',
              label: 'Split Right',
              shortcut: 'Ctrl+\\',
              action: () => dispatch('orion:split-right'),
            },
            {
              type: 'action',
              label: 'Split Down',
              action: () => dispatch('orion:split-down'),
            },
          ],
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Terminal',
          shortcut: 'Ctrl+`',
          action: () => dispatch('orion:toggle-terminal'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Toggle Minimap',
          action: () => dispatch('orion:toggle-minimap'),
        },
        {
          type: 'action',
          label: 'Word Wrap',
          shortcut: 'Alt+Z',
          action: () => dispatch('orion:toggle-wordwrap'),
        },
      ],
    },
    /* ======================== Go ======================== */
    {
      label: 'Go',
      items: [
        {
          type: 'action',
          label: 'Go to File...',
          shortcut: 'Ctrl+P',
          action: () => dispatch('orion:open-palette'),
        },
        {
          type: 'action',
          label: 'Go to Line...',
          shortcut: 'Ctrl+G',
          action: () => dispatch('orion:go-to-line'),
        },
        {
          type: 'action',
          label: 'Go to Symbol...',
          shortcut: 'Ctrl+Shift+O',
          action: () => dispatch('orion:show-outline'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Go to Definition',
          shortcut: 'F12',
          action: () => dispatch('orion:go-to-definition'),
        },
        {
          type: 'action',
          label: 'Go to References',
          shortcut: 'Shift+F12',
          action: () => dispatch('orion:go-to-references'),
        },
      ],
    },
    /* ======================== Run ======================== */
    {
      label: 'Run',
      items: [
        {
          type: 'action',
          label: 'Run Build Task',
          shortcut: 'Ctrl+Shift+B',
          action: () => dispatch('orion:run-build'),
        },
        {
          type: 'action',
          label: 'Run Task...',
          action: () => dispatch('orion:run-task'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Toggle Breakpoint',
          shortcut: 'F9',
          action: () => dispatch('orion:toggle-breakpoint'),
        },
      ],
    },
    /* ======================== Terminal ======================== */
    {
      label: 'Terminal',
      items: [
        {
          type: 'action',
          label: 'New Terminal',
          shortcut: 'Ctrl+`',
          action: () => dispatch('orion:toggle-terminal'),
        },
        {
          type: 'action',
          label: 'Split Terminal',
          action: () => dispatch('orion:split-terminal'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Clear Terminal',
          action: () => dispatch('orion:clear-terminal'),
        },
      ],
    },
    /* ======================== Help ======================== */
    {
      label: 'Help',
      items: [
        {
          type: 'action',
          label: 'Welcome',
          action: () => dispatch('orion:show-welcome'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Keyboard Shortcuts Reference',
          shortcut: 'Ctrl+K Ctrl+S',
          action: () => dispatch('orion:keyboard-shortcuts'),
        },
        {
          type: 'action',
          label: 'Documentation',
          action: () =>
            window.open('https://github.com/concrete-sangminlee/orion', '_blank'),
        },
        {
          type: 'action',
          label: 'Release Notes',
          action: () => dispatch('orion:show-release-notes'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Report Issue',
          action: () =>
            window.open('https://github.com/concrete-sangminlee/orion/issues', '_blank'),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'About Orion',
          action: () => dispatch('orion:show-about'),
        },
      ],
    },
  ]
}

/* ------------------------------------------------------------------ */
/*  Submenu component                                                  */
/* ------------------------------------------------------------------ */

function SubMenu({
  items,
  onClose,
}: {
  items: MenuItem[]
  onClose: () => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div
      style={{
        position: 'absolute',
        top: -4,
        left: '100%',
        marginLeft: 2,
        minWidth: 200,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
        padding: 4,
        zIndex: 10000,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return (
            <div
              key={`sep-${idx}`}
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '4px 8px',
              }}
            />
          )
        }

        if (item.type === 'submenu') {
          const isHovered = hoveredIdx === idx
          return (
            <div
              key={item.label}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  fontSize: 12,
                  padding: '5px 8px',
                  borderRadius: 4,
                  color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  cursor: 'default',
                  lineHeight: '18px',
                  transition: 'background 0.08s, color 0.08s',
                }}
              >
                <span>{item.label}</span>
                <ChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0, marginLeft: 16 }} />
              </div>
              {isHovered && <SubMenu items={item.children} onClose={onClose} />}
            </div>
          )
        }

        const isHovered = hoveredIdx === idx
        return (
          <button
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              fontSize: 12,
              padding: '5px 8px',
              borderRadius: 4,
              color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              cursor: 'default',
              textAlign: 'left',
              lineHeight: '18px',
              transition: 'background 0.08s, color 0.08s',
            }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => {
              item.action()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginLeft: 32,
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dropdown component                                                 */
/* ------------------------------------------------------------------ */

function DropdownMenu({
  items,
  onClose,
}: {
  items: MenuItem[]
  onClose: () => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 2,
        minWidth: 240,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
        padding: 4,
        zIndex: 9999,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return (
            <div
              key={`sep-${idx}`}
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '4px 8px',
              }}
            />
          )
        }

        if (item.type === 'submenu') {
          const isHovered = hoveredIdx === idx
          return (
            <div
              key={item.label}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  fontSize: 12,
                  padding: '5px 8px',
                  borderRadius: 4,
                  color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  cursor: 'default',
                  lineHeight: '18px',
                  transition: 'background 0.08s, color 0.08s',
                }}
              >
                <span>{item.label}</span>
                <ChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0, marginLeft: 16 }} />
              </div>
              {isHovered && <SubMenu items={item.children} onClose={onClose} />}
            </div>
          )
        }

        const isHovered = hoveredIdx === idx
        return (
          <button
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              fontSize: 12,
              padding: '5px 8px',
              borderRadius: 4,
              color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              cursor: 'default',
              textAlign: 'left',
              lineHeight: '18px',
              transition: 'background 0.08s, color 0.08s',
            }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => {
              item.action()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginLeft: 32,
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TitleBar                                                           */
/* ------------------------------------------------------------------ */

export default function TitleBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)

  const fileStore = useFileStore()
  const editorStore = useEditorStore()
  const recentFiles = useRecentFilesStore((s) => s.getRecent(5))
  const menus = buildMenus(fileStore, editorStore, recentFiles)

  /* Close dropdown on outside click */
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    },
    [],
  )

  useEffect(() => {
    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenu, handleClickOutside])

  const closeMenu = useCallback(() => setOpenMenu(null), [])

  return (
    <header
      className="shrink-0 flex items-center select-none"
      style={{
        height: 38,
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Logo + Brand */}
      <div
        className="flex items-center gap-2"
        style={{ paddingLeft: 14, paddingRight: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Zap size={10} color="#fff" fill="#fff" />
        </div>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.3px',
          }}
        >
          Orion
        </span>
      </div>

      {/* Menu Items */}
      <nav
        ref={navRef}
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag', height: '100%' } as React.CSSProperties}
      >
        {menus.map((menu) => {
          const isOpen = openMenu === menu.label
          const isHighlighted = isOpen || hoveredMenu === menu.label

          return (
            <div
              key={menu.label}
              style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}
            >
              <button
                className="flex items-center justify-center"
                style={{
                  height: '100%',
                  padding: '0 8px',
                  fontSize: 12,
                  color: isHighlighted ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: isOpen
                    ? 'rgba(255, 255, 255, 0.10)'
                    : isHighlighted
                      ? 'rgba(255, 255, 255, 0.06)'
                      : 'transparent',
                  borderRadius: 4,
                  margin: '0 1px',
                  transition: 'color 0.1s, background 0.1s',
                  cursor: 'default',
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setOpenMenu(isOpen ? null : menu.label)
                }}
                onMouseEnter={() => {
                  setHoveredMenu(menu.label)
                  /* Switch menus while another dropdown is already open */
                  if (openMenu && openMenu !== menu.label) {
                    setOpenMenu(menu.label)
                  }
                }}
                onMouseLeave={() => {
                  if (!openMenu) setHoveredMenu(null)
                }}
              >
                {menu.label}
              </button>

              {isOpen && (
                <DropdownMenu items={menu.items} onClose={closeMenu} />
              )}
            </div>
          )
        })}
      </nav>

      {/* Center drag region */}
      <div className="flex-1" />

      {/* Window title (shows active file name) */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
          opacity: 0.6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {editorStore.activeFilePath ? (
          <>
            <span>{editorStore.openFiles.find(f => f.path === editorStore.activeFilePath)?.name || 'Untitled'}</span>
            <span style={{ opacity: 0.5 }}>—</span>
            <span>Orion</span>
          </>
        ) : (
          'Orion'
        )}
      </div>

      {/* Window controls */}
      <div
        className="flex items-center"
        style={{ height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {[
          {
            Icon: Minus,
            onClick: () => window.api?.minimize(),
            hoverBg: 'rgba(255, 255, 255, 0.06)',
            hoverColor: 'var(--text-primary)',
          },
          {
            Icon: Square,
            onClick: () => window.api?.maximize(),
            hoverBg: 'rgba(255, 255, 255, 0.06)',
            hoverColor: 'var(--text-primary)',
            size: 10,
          },
          {
            Icon: X,
            onClick: () => window.api?.close(),
            hoverBg: '#c42b1c',
            hoverColor: '#ffffff',
          },
        ].map(({ Icon, onClick, hoverBg, hoverColor, size }, i) => (
          <button
            key={i}
            onClick={onClick}
            className="flex items-center justify-center"
            style={{
              width: 46,
              height: '100%',
              color: 'var(--text-muted)',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = hoverBg
              e.currentTarget.style.color = hoverColor
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            <Icon size={(size as number) || 13} strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </header>
  )
}
