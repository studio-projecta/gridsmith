import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store/useStore'
import type { GroupType } from '../types'

interface ItemProps {
  type: GroupType
  selected: boolean
  editing: boolean
  editName: string
  setEditName: (v: string) => void
  onSelect: () => void
  onStartEdit: () => void
  onCommitEdit: () => void
  onDelete: () => void
}

function SortableType({
  type,
  selected,
  editing,
  editName,
  setEditName,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onDelete,
}: ItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: type.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.5, zIndex: 2 } : null),
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={selected ? 'active' : ''}
      onClick={onSelect}
    >
      <button
        ref={setActivatorNodeRef}
        className="type-grip"
        title="드래그하여 순서 변경"
        aria-label="순서 변경"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => e.key === 'Enter' && onCommitEdit()}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="type-name"
          onDoubleClick={(e) => {
            e.stopPropagation()
            onStartEdit()
          }}
        >
          {type.name}
        </span>
      )}
      <button
        className="type-del"
        title="삭제"
        aria-label="삭제"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        ✕
      </button>
    </li>
  )
}

export default function TypeSidebar() {
  const types = useStore((s) => s.types)
  const selectedTypeId = useStore((s) => s.selectedTypeId)
  const addType = useStore((s) => s.addType)
  const renameType = useStore((s) => s.renameType)
  const removeType = useStore((s) => s.removeType)
  const reorderTypes = useStore((s) => s.reorderTypes)
  const selectType = useStore((s) => s.selectType)

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // 클릭(선택)과 드래그를 구분하기 위한 최소 이동 거리.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleAdd = () => {
    if (!newName.trim()) return
    void addType(newName)
    setNewName('')
  }

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
  }

  const commitEdit = () => {
    if (editingId) void renameType(editingId, editName)
    setEditingId(null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = types.map((t) => t.id)
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    if (from === -1 || to === -1) return
    void reorderTypes(arrayMove(ids, from, to))
  }

  return (
    <aside className="sidebar">
      <h2>그룹유형</h2>

      <div className="type-add">
        <input
          value={newName}
          placeholder="새 유형 이름"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd}>추가</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={types.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="type-list">
            {types.map((t) => (
              <SortableType
                key={t.id}
                type={t}
                selected={t.id === selectedTypeId}
                editing={editingId === t.id}
                editName={editName}
                setEditName={setEditName}
                onSelect={() => void selectType(t.id)}
                onStartEdit={() => startEdit(t.id, t.name)}
                onCommitEdit={commitEdit}
                onDelete={() => {
                  if (confirm(`"${t.name}" 유형과 그 이미지를 삭제할까요?`)) {
                    void removeType(t.id)
                  }
                }}
              />
            ))}
            {types.length === 0 && <li className="empty">유형을 추가하세요</li>}
          </ul>
        </SortableContext>
      </DndContext>
    </aside>
  )
}
