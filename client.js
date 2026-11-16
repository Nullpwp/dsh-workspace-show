/**
 * Workspace displays — adds a "Shown workspaces" section to the sidebar's
 * existing view-options menu (the sliders button at the top-right of the
 * Workspaces list) so each Workspace can be shown or hidden there.
 *
 * The shipped view-options menu is built inside
 * `@deepseek-ai/dsh-client-ui-workspace` and declares no extension slot, so the
 * section is a React portal into that menu's rendered viewport. The menu is
 * told apart without localized text: the view-options Menu renders its trigger
 * in the sidebar header and portals its list to the body, and the two carry the
 * same CSS anchor name (`anchor-name` / `position-anchor`).
 *
 * Hiding only marks the rendered Workspace group section (the ancestor carrying
 * the `--dsh-workspace-indent` inline style). The Workspace record, its
 * Sessions, history and path are untouched, and turning the plugin off removes
 * every mark.
 */
window.__ModuleLoader__.load({
  id: 'dsh-workspace-show',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let createPortal = null
    try {
      const ReactDOM = require('react-dom')
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal
    } catch {}
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore } = React

    const OWNER = 'dsh-workspace-show'
    const NS = 'dsh-workspace-show'
    const ENTRY_ID = 'dsh-workspace-show:view-options'
    const STORAGE_KEY = 'dsh-workspace-show:hidden-workspaces.v1'
    const HIDDEN_ATTR = 'data-wss-workspace-hidden'
    const DEFAULT_WORKSPACE_TITLE = 'default-workspace'
    const HEADER_SELECTOR = '[data-sidebar-workspace-header]'
    const MENU_SELECTOR = '[role="menu"][data-menu-material]'
    const VIEWPORT_SELECTOR = 'div[role="presentation"]'
    const LIST_SELECTOR = '[data-sidebar-list-area]'
    const ROW_SELECTOR = '[data-row-key^="workspace:"]'
    const SECTION_SELECTOR = '[style*="--dsh-workspace-indent"]'
    const EMPTY_ITEMS = Object.freeze([])
    /** The view-options menu's first group label in every locale the shipped browser declares. */
    const VIEW_MENU_LABELS = new Set([
      '分组方式', 'Group by', 'グループ化', 'Agrupar por', 'Regrouper par', 'Gruppieren nach', 'Группировать по',
    ])

    const EN = {
      section: 'Shown workspaces',
      reset: 'Show all workspaces',
      hide: 'Hide this workspace',
      show: 'Show this workspace',
      defaultWorkspace: 'Default workspace',
      unnamedWorkspace: 'Unnamed workspace',
      storageError: 'Settings cannot be saved in this browser; they last until reload.',
      flatNote: 'The sidebar shows the flat session list. Hidden workspaces apply when you switch back to grouping by workspace.',
      parentHidden: 'parent workspace is hidden',
    }

    const ZH = {
      section: '显示工作区',
      reset: '全部显示工作区',
      hide: '隐藏此工作区',
      show: '显示此工作区',
      defaultWorkspace: '默认工作区',
      unnamedWorkspace: '未命名工作区',
      storageError: '浏览器无法保存设置，本次打开期间有效。',
      flatNote: '侧栏当前是单列表显示；隐藏设置会在切回「按工作区」后生效。',
      parentHidden: '父级工作区已隐藏',
    }

    /* Row metrics mirror the shipped menu row (dense list): 30px rows, 4px
       block padding, a 14px leading icon column and a trailing check. */
    const CSS = `
.wss-menu-sep { height:.5px; margin:3px 8px; background:var(--dsw-alias-border-l2); }
.wss-menu-label { padding:3px 8px; font-size:11px; line-height:15px; color:var(--dsw-alias-label-tertiary); }
.wss-menu-note { padding:0 8px 4px; font-size:11px; line-height:15px; color:var(--dsw-alias-label-secondary); }
.wss-menu-item { display:flex; align-items:center; gap:6px; width:100%; min-height:30px; padding:4px 8px; border:none; border-radius:var(--dsw-radius-md); background:transparent; cursor:pointer; font-size:13px; line-height:20px; color:var(--dsw-alias-label-primary); text-align:left; font-family:inherit; }
@media (hover:hover) { .wss-menu-item:hover { background:var(--dsw-alias-interactive-bg-hover); } }
.wss-menu-item:focus-visible { background:var(--dsw-alias-interactive-bg-hover); outline:none; }
.wss-menu-item[data-wss-hidden] { color:var(--dsw-alias-label-secondary); }
.wss-menu-item[data-wss-hidden] .wss-menu-icon, .wss-menu-item[data-wss-parent-hidden] .wss-menu-icon { color:inherit; }
.wss-menu-item[data-wss-parent-hidden] { color:var(--dsw-alias-label-secondary); opacity:.65; }
.wss-menu-icon { display:inline-flex; flex:none; width:14px; height:14px; align-items:center; justify-content:center; color:var(--dsw-alias-menu-icon); }
.wss-menu-icon svg { width:14px; height:14px; }
.wss-menu-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wss-menu-check { flex:none; display:inline-flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-primary); }
.wss-menu-check svg { width:14px; height:14px; }
[${HIDDEN_ATTR}] { display:none !important; }
`

    function ensureStyles() {
      if (typeof document === 'undefined') return () => {}
      const id = 'dsh-workspace-show-style'
      let style = document.getElementById(id)
      if (!style) {
        style = document.createElement('style')
        style.id = id
        document.head.appendChild(style)
      }
      if (style.textContent !== CSS) style.textContent = CSS
      return () => {
        if (style && style.parentNode) style.parentNode.removeChild(style)
      }
    }

    function FolderIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: 'false',
      },
        h('path', {
          d: 'M1.8 4.9c0-.7.6-1.3 1.3-1.3h2.9l1.5 1.5h4.4c.7 0 1.3.6 1.3 1.3v4.7c0 .7-.6 1.3-1.3 1.3H3.1c-.7 0-1.3-.6-1.3-1.3V4.9Z',
          stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round',
        }),
        h('path', { d: 'M1.8 6.6h12.4', stroke: 'currentColor', strokeWidth: 1.1 }),
      )
    }

    function CheckIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: 'false',
      },
        h('path', {
          d: 'M3 8.4 6.2 11.6 13 4.8',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
      )
    }

    function ResetIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: 'false',
      },
        h('path', {
          d: 'M12.8 6.2A5 5 0 1 0 13 9.1',
          stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M12.9 2.9v3.4H9.5',
          stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
      )
    }

    function isZhLocale(locale) {
      try {
        if (!locale || typeof locale.getLocale !== 'function') return false
        const snapshot = locale.getLocale()
        const active = snapshot && typeof snapshot.active === 'string' ? snapshot.active : ''
        return active.slice(0, 2).toLowerCase() === 'zh'
      } catch {
        return false
      }
    }

    function useTranslate(ctx) {
      const locale = ctx.get('locale')
      const subscribe = useCallback((onChange) => {
        try {
          if (locale && typeof locale.subscribe === 'function') {
            const dispose = locale.subscribe(onChange)
            return typeof dispose === 'function' ? dispose : () => {}
          }
        } catch {}
        return () => {}
      }, [locale])
      const getRevision = useCallback(() => {
        try {
          if (locale && typeof locale.getSnapshot === 'function') return locale.getSnapshot().revision || 0
        } catch {}
        return 0
      }, [locale])
      useSyncExternalStore(subscribe, getRevision, getRevision)
      const bound = React.useMemo(() => {
        try {
          if (locale && typeof locale.bind === 'function') return locale.bind(NS)
        } catch {}
        return null
      }, [locale])
      const chinese = isZhLocale(locale)
      return useCallback((key) => {
        if (bound) {
          try {
            const value = bound(key)
            if (typeof value === 'string' && value !== key) return value
          } catch {}
        }
        const dict = chinese ? ZH : EN
        if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key]
        return Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key
      }, [bound, chinese])
    }

    function workspaceTitle(item, t) {
      const title = item && typeof item.title === 'string' ? item.title.trim() : ''
      if (!title) return t('unnamedWorkspace')
      if (title === DEFAULT_WORKSPACE_TITLE) return t('defaultWorkspace')
      return title
    }

    /**
     * Locate the view-options menu's item viewport. Only that menu keeps its
     * trigger in the sidebar Workspace header while its list is portalled to
     * the body, and both sides share one CSS anchor name.
     */
    function findViewOptionsViewport() {
      if (typeof document === 'undefined') return null
      const header = document.querySelector(HEADER_SELECTOR)
      if (!header) return null
      const anchors = header.querySelectorAll('span[style*="anchor-name"]')
      for (const anchor of anchors) {
        let name = ''
        try {
          name = (anchor.style.getPropertyValue('anchor-name') || '').trim()
        } catch {}
        if (!name) continue
        const menus = document.querySelectorAll(MENU_SELECTOR)
        for (const menu of menus) {
          let declared = ''
          try {
            declared = (menu.style.getPropertyValue('position-anchor') || '').trim()
          } catch {}
          if (declared !== name) continue
          const viewport = menu.querySelector(VIEWPORT_SELECTOR)
          if (viewport) return viewport
        }
      }
      return findViewOptionsViewportByLabel()
    }

    /** Fallback for a changed anchor style: recognize the menu by its group-by label. */
    function findViewOptionsViewportByLabel() {
      const menus = document.querySelectorAll(MENU_SELECTOR)
      for (const menu of menus) {
        const viewport = menu.querySelector(VIEWPORT_SELECTOR)
        if (!viewport) continue
        const labels = viewport.querySelectorAll(':scope > div[role="presentation"]')
        for (const label of labels) {
          const text = (label.textContent || '').trim()
          if (VIEW_MENU_LABELS.has(text)) return viewport
        }
      }
      return null
    }

    /** Track the open view-options viewport, re-locating whenever it is replaced. */
    function useViewOptionsViewport() {
      const [viewport, setViewport] = useState(null)
      const viewportRef = useRef(null)
      viewportRef.current = viewport
      useEffect(() => {
        if (typeof document === 'undefined') return undefined
        let raf = 0
        let observer = null
        const locate = () => {
          raf = 0
          const next = findViewOptionsViewport()
          setViewport((prev) => (prev === next ? prev : next))
        }
        const schedule = () => {
          if (raf) return
          if (typeof requestAnimationFrame !== 'function') {
            locate()
            return
          }
          raf = requestAnimationFrame(locate)
        }
        locate()
        if (typeof MutationObserver === 'function' && document.body) {
          observer = new MutationObserver(() => {
            const current = viewportRef.current
            if (current && current.isConnected) return
            schedule()
          })
          observer.observe(document.body, { childList: true, subtree: true })
        }
        return () => {
          if (observer) observer.disconnect()
          if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
        }
      }, [])
      return viewport
    }

    function escapeAttributeValue(value) {
      if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(value)
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /**
     * Whether the sidebar is in the flat single list. Search results and an
     * empty archive filter also render no Workspace groups, so both are
     * excluded rather than mislabelled as flat mode.
     */
    function isFlatSessionList() {
      if (typeof document === 'undefined') return false
      const area = document.querySelector(LIST_SELECTOR)
      if (!area) return false
      if (area.querySelector(ROW_SELECTOR) !== null) return false
      if (area.querySelector('[data-row-key="empty"]') !== null) return false
      const header = document.querySelector(HEADER_SELECTOR)
      const input = header ? header.querySelector('input') : null
      if (input && typeof input.value === 'string' && input.value.trim() !== '') return false
      return true
    }

    /** Whether this Workspace's section sits inside a hidden ancestor section. */
    function hasHiddenAncestor(workspaceId) {
      if (typeof document === 'undefined') return false
      try {
        const row = document.querySelector('[data-row-key="workspace:' + escapeAttributeValue(workspaceId) + '"]')
        if (!row) return false
        const section = row.closest(SECTION_SELECTOR)
        if (!section) return false
        const parent = section.parentElement
        return !!(parent && parent.closest('[' + HIDDEN_ATTR + ']'))
      } catch {
        return false
      }
    }

    function createSection(ctx, controller) {
      return function WorkspaceVisibilitySection({ useWorkspaces }) {
        const t = useTranslate(ctx)
        useSyncExternalStore(controller.subscribe, controller.getVersion, controller.getVersion)
        const items = typeof useWorkspaces === 'function'
          ? useWorkspaces((state) => (state && Array.isArray(state.items) ? state.items : EMPTY_ITEMS))
          : EMPTY_ITEMS
        const phase = typeof useWorkspaces === 'function'
          ? useWorkspaces((state) => (state && typeof state.phase === 'string' ? state.phase : 'pending'))
          : 'pending'
        const viewport = useViewOptionsViewport()
        const [flatMode, setFlatMode] = useState(false)

        useEffect(() => {
          if (!viewport) {
            setFlatMode(false)
            return
          }
          setFlatMode(isFlatSessionList())
        }, [viewport])

        useEffect(() => {
          if (phase !== 'ready' || items.length === 0) return
          const ids = []
          for (const item of items) {
            if (item && typeof item.workspaceId === 'string') ids.push(item.workspaceId)
          }
          if (ids.length > 0) controller.retain(ids)
        }, [phase, items])

        if (!viewport || !createPortal) return null

        /** Keep Tab inside the menu: the Host only closes it for plain menuitems. */
        const moveMenuFocus = (event) => {
          if (event.key !== 'Tab') return
          const buttons = Array.from(viewport.querySelectorAll('button:not(:disabled)'))
          const index = buttons.indexOf(event.currentTarget)
          if (index < 0) return
          event.preventDefault()
          const next = event.shiftKey ? index - 1 : index + 1
          if (next < 0 || next >= buttons.length) return
          buttons[next].focus()
        }

        const storageError = controller.storageError()
        const rows = []
        let hiddenCount = 0
        for (const item of items) {
          if (!item || typeof item.workspaceId !== 'string') continue
          const hidden = controller.isHidden(item.workspaceId)
          if (hidden) hiddenCount += 1
          const parentHidden = !hidden && hasHiddenAncestor(item.workspaceId)
          const label = workspaceTitle(item, t)
          const action = hidden ? t('show') : t('hide')
          rows.push(h('button', {
            key: item.workspaceId,
            type: 'button',
            role: 'menuitemcheckbox',
            tabIndex: -1,
            'data-wss-row': '',
            'aria-checked': hidden ? 'false' : 'true',
            'aria-label': label + ' — ' + action,
            className: 'wss-menu-item',
            title: parentHidden ? label + ' — ' + t('parentHidden') : label,
            ...(hidden ? { 'data-wss-hidden': '' } : {}),
            ...(parentHidden ? { 'data-wss-parent-hidden': '' } : {}),
            onClick: () => controller.toggle(item.workspaceId),
            onKeyDown: moveMenuFocus,
          },
            h('span', { key: 'icon', className: 'wss-menu-icon', 'aria-hidden': 'true' }, h(FolderIcon)),
            h('span', { key: 'label', className: 'wss-menu-text' }, label),
            hidden ? null : h('span', { key: 'check', className: 'wss-menu-check', 'aria-hidden': 'true' }, h(CheckIcon)),
          ))
        }

        if (rows.length === 0) return null

        const section = [
          h('div', { key: 'wss-sep', className: 'wss-menu-sep', role: 'separator' }),
          h('div', { key: 'wss-label', className: 'wss-menu-label', role: 'presentation' }, t('section')),
        ]
        if (flatMode) {
          section.push(h('div', { key: 'wss-flat', className: 'wss-menu-note', role: 'status' }, t('flatNote')))
        }
        for (const row of rows) section.push(row)
        if (storageError) {
          section.push(h('div', { key: 'wss-note', className: 'wss-menu-note', role: 'status' }, t('storageError')))
        }
        if (hiddenCount > 0) {
          section.push(h('button', {
            key: 'wss-reset',
            type: 'button',
            role: 'menuitem',
            tabIndex: -1,
            className: 'wss-menu-item',
            onKeyDown: moveMenuFocus,
            onClick: () => {
              controller.showAll()
              setTimeout(() => {
                if (!viewport.isConnected) return
                const first = viewport.querySelector('[data-wss-row]')
                if (first instanceof HTMLElement) {
                  first.focus()
                  first.scrollIntoView({ block: 'nearest' })
                }
              }, 0)
            },
          },
            h('span', { key: 'icon', className: 'wss-menu-icon', 'aria-hidden': 'true' }, h(ResetIcon)),
            h('span', { key: 'label', className: 'wss-menu-text' }, t('reset')),
          ))
        }

        return createPortal(section, viewport)
      }
    }

    function createController() {
      const Hidden = new Set()
      const listeners = new Set()
      let version = 0
      let storageOk = true
      let disposed = false
      let scheduled = false
      let observer = null

      const getVersion = () => version
      const subscribe = (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }
      const notify = () => {
        version += 1
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch {}
        }
      }

      const load = () => {
        Hidden.clear()
        try {
          if (typeof window === 'undefined' || !window.localStorage) {
            storageOk = false
            return
          }
          const raw = window.localStorage.getItem(STORAGE_KEY)
          storageOk = true
          if (!raw) return
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return
          for (const id of parsed) {
            if (typeof id === 'string' && id) Hidden.add(id)
          }
        } catch {
          storageOk = false
        }
      }

      const save = () => {
        try {
          if (typeof window === 'undefined' || !window.localStorage) {
            storageOk = false
            return
          }
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...Hidden]))
          storageOk = true
        } catch {
          storageOk = false
        }
      }

      /** Mark or unmark every rendered Workspace group section. */
      const apply = () => {
        if (typeof document === 'undefined') return
        const area = document.querySelector(LIST_SELECTOR)
        if (!area) return
        const rows = area.querySelectorAll(ROW_SELECTOR)
        for (const row of rows) {
          const raw = row.getAttribute('data-row-key') || ''
          const id = raw.slice('workspace:'.length)
          if (!id) continue
          const section = row.closest(SECTION_SELECTOR)
          if (!section) continue
          if (Hidden.has(id)) section.setAttribute(HIDDEN_ATTR, '')
          else if (section.hasAttribute(HIDDEN_ATTR)) section.removeAttribute(HIDDEN_ATTR)
        }
      }

      const scheduleApply = () => {
        if (scheduled || disposed) return
        scheduled = true
        const run = () => {
          scheduled = false
          if (!disposed) apply()
        }
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
        else Promise.resolve().then(run)
      }

      const toggle = (workspaceId) => {
        if (typeof workspaceId !== 'string' || !workspaceId) return
        if (Hidden.has(workspaceId)) Hidden.delete(workspaceId)
        else Hidden.add(workspaceId)
        save()
        apply()
        notify()
      }

      const showAll = () => {
        Hidden.clear()
        save()
        apply()
        notify()
      }

      /** Drop preferences for Workspaces that no longer exist. */
      const retain = (workspaceIds) => {
        const keep = new Set(workspaceIds)
        let changed = false
        for (const id of [...Hidden]) {
          if (keep.has(id)) continue
          Hidden.delete(id)
          changed = true
        }
        if (!changed) return
        save()
        apply()
        notify()
      }

      const onStorage = (event) => {
        if (!event || event.key !== STORAGE_KEY) return
        load()
        apply()
        notify()
      }

      const start = () => {
        load()
        apply()
        if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
        if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body) {
          observer = new MutationObserver(scheduleApply)
          observer.observe(document.body, { childList: true, subtree: true })
        }
      }

      const dispose = () => {
        if (disposed) return
        disposed = true
        if (observer) {
          observer.disconnect()
          observer = null
        }
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
        if (typeof document !== 'undefined') {
          const marked = document.querySelectorAll('[' + HIDDEN_ATTR + ']')
          for (const node of marked) node.removeAttribute(HIDDEN_ATTR)
        }
        listeners.clear()
      }

      return {
        subscribe,
        getVersion,
        isHidden: (workspaceId) => Hidden.has(workspaceId),
        toggle,
        showAll,
        retain,
        storageError: () => !storageOk,
        start,
        dispose,
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const removeStyles = ensureStyles()

        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => {
            const disposers = []
            const register = (id, dict) => {
              try {
                const dispose = locale.register(NS, id, dict)
                if (typeof dispose === 'function') disposers.push(dispose)
              } catch {}
            }
            register('zh', ZH)
            register('en', EN)
            return () => {
              for (const dispose of disposers) {
                try {
                  dispose()
                } catch {}
              }
            }
          }, 'dsh-workspace-show: dictionaries')
        }

        const controller = createController()
        ctx.effect(() => {
          controller.start()
          return () => {
            controller.dispose()
            removeStyles()
          }
        }, 'dsh-workspace-show: workspace visibility')

        const Section = createSection(ctx, controller)
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: ENTRY_ID,
          order: 50,
          registrant: OWNER,
        }, Section))
      },
    }
  },
})
