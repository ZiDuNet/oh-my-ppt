import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────

export interface DragEditItem {
  pageId: string
  htmlPath: string
  selector: string
  x: number
  y: number
  width: number | null
  height: number | null
  childUpdates: Array<{ path: number[]; width?: number; height?: number }>
  isAbsoluteMode: boolean
  zIndex?: number
  zIndexOnly?: boolean
}

export interface TextEditItem {
  pageId: string
  htmlPath: string
  selector: string
  patch: {
    text?: string
    style: { color?: string; fontSize?: string; fontWeight?: string }
  }
}

export interface DeleteItem {
  pageId: string
  htmlPath: string
  selector: string
}

export interface AddElementItem {
  pageId: string
  htmlPath: string
  parentSelector: string
  htmlFragment: string
  assignedBlockId: string
  insertIndex: number
}

export interface EditSnapshot {
  dragEdits: DragEditItem[]
  textEdits: TextEditItem[]
  deletes: DeleteItem[]
  addElements: AddElementItem[]
}

// ─── Helpers ──────────────────────────────────────────

function cloneSnapshot(s: EditSnapshot): EditSnapshot {
  return {
    dragEdits: s.dragEdits.map((e) => ({
      ...e,
      childUpdates: e.childUpdates.map((c) => ({ ...c }))
    })),
    textEdits: s.textEdits.map((e) => ({
      ...e,
      patch: {
        text: e.patch.text,
        style: { ...e.patch.style }
      }
    })),
    deletes: s.deletes.map((e) => ({ ...e })),
    addElements: s.addElements.map((e) => ({ ...e }))
  }
}

function takeSnapshot(
  dragEdits: DragEditItem[],
  textEdits: TextEditItem[],
  deletes: DeleteItem[],
  addElements: AddElementItem[]
): EditSnapshot {
  return cloneSnapshot({ dragEdits, textEdits, deletes, addElements })
}

// ─── Store ────────────────────────────────────────────

interface EditHistoryState {
  dragEdits: DragEditItem[]
  textEdits: TextEditItem[]
  deletes: DeleteItem[]
  addElements: AddElementItem[]
  undoStack: EditSnapshot[]
  redoStack: EditSnapshot[]

  upsertDragEdit: (edit: DragEditItem) => void
  upsertTextEdit: (edit: TextEditItem) => void
  addDelete: (item: DeleteItem) => void
  addElement: (item: AddElementItem) => void
  undo: () => EditSnapshot | null
  redo: () => EditSnapshot | null
  canUndo: () => boolean
  canRedo: () => boolean
  clearPage: (pageId: string) => void
  clear: () => void
  getSnapshotForPage: (pageId: string) => EditSnapshot
}

export const useEditHistoryStore = create<EditHistoryState>((set, get) => ({
  dragEdits: [],
  textEdits: [],
  deletes: [],
  addElements: [],
  undoStack: [],
  redoStack: [],

  upsertDragEdit: (edit) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes, state.addElements)
      const idx = state.dragEdits.findIndex(
        (item) =>
          item.pageId === edit.pageId &&
          item.htmlPath === edit.htmlPath &&
          item.selector === edit.selector
      )
      let next: DragEditItem[]
      if (idx < 0) {
        next = [...state.dragEdits, edit]
      } else {
        // Merge: zIndexOnly edits preserve existing position data;
        // drag edits preserve existing zIndex if new edit has none
        const existing = state.dragEdits[idx]
        const merged: DragEditItem = {
          ...edit,
          zIndex: edit.zIndex ?? existing.zIndex
        }
        if (edit.zIndexOnly) {
          // Z-index-only change: keep existing position data, preserve flag
          merged.x = existing.x
          merged.y = existing.y
          merged.width = existing.width
          merged.height = existing.height
          merged.childUpdates = existing.childUpdates
          merged.isAbsoluteMode = existing.isAbsoluteMode
          merged.zIndexOnly = true
        } else {
          // Full drag edit: clear zIndexOnly flag since position is also being updated
          merged.zIndexOnly = undefined
        }
        next = state.dragEdits.map((item, i) => (i === idx ? merged : item))
      }
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        dragEdits: next
      }
    }),

  upsertTextEdit: (edit) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes, state.addElements)
      const idx = state.textEdits.findIndex(
        (item) =>
          item.pageId === edit.pageId &&
          item.selector === edit.selector
      )
      const next =
        idx < 0
          ? [...state.textEdits, edit]
          : state.textEdits.map((item, i) => (i === idx ? edit : item))
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        textEdits: next
      }
    }),

  addDelete: (item) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes, state.addElements)
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        deletes: [...state.deletes, item]
      }
    }),

  addElement: (item) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes, state.addElements)
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        addElements: [...state.addElements, item]
      }
    }),

  undo: () => {
    const state = get()
    if (state.undoStack.length === 0) return null
    const prev = state.undoStack[state.undoStack.length - 1]
    const current = takeSnapshot(state.dragEdits, state.textEdits, state.deletes, state.addElements)
    set({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
      dragEdits: prev.dragEdits,
      textEdits: prev.textEdits,
      deletes: prev.deletes,
      addElements: prev.addElements
    })
    return cloneSnapshot(prev)
  },

  redo: () => {
    const state = get()
    if (state.redoStack.length === 0) return null
    const next = state.redoStack[state.redoStack.length - 1]
    const current = takeSnapshot(state.dragEdits, state.textEdits, state.deletes, state.addElements)
    set({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, current],
      dragEdits: next.dragEdits,
      textEdits: next.textEdits,
      deletes: next.deletes,
      addElements: next.addElements
    })
    return cloneSnapshot(next)
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clearPage: (_pageId) =>
    set(() => ({
      dragEdits: [],
      textEdits: [],
      deletes: [],
      addElements: [],
      undoStack: [],
      redoStack: []
    })),

  clear: () =>
    set({
      dragEdits: [],
      textEdits: [],
      deletes: [],
      addElements: [],
      undoStack: [],
      redoStack: []
    }),

  getSnapshotForPage: (pageId) => {
    const state = get()
    return {
      dragEdits: state.dragEdits.filter((e) => e.pageId === pageId),
      textEdits: state.textEdits.filter((e) => e.pageId === pageId),
      deletes: state.deletes.filter((e) => e.pageId === pageId),
      addElements: state.addElements.filter((e) => e.pageId === pageId)
    }
  }
}))
