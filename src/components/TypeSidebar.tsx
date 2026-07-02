import { useState } from 'react'
import { useStore } from '../store/useStore'

export default function TypeSidebar() {
  const types = useStore((s) => s.types)
  const selectedTypeId = useStore((s) => s.selectedTypeId)
  const addType = useStore((s) => s.addType)
  const renameType = useStore((s) => s.renameType)
  const removeType = useStore((s) => s.removeType)
  const selectType = useStore((s) => s.selectType)

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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

      <ul className="type-list">
        {types.map((t) => (
          <li
            key={t.id}
            className={t.id === selectedTypeId ? 'active' : ''}
            onClick={() => void selectType(t.id)}
          >
            {editingId === t.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="type-name"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  startEdit(t.id, t.name)
                }}
              >
                {t.name}
              </span>
            )}
            <button
              className="type-del"
              title="삭제"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`"${t.name}" 유형과 그 이미지를 삭제할까요?`)) {
                  void removeType(t.id)
                }
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {types.length === 0 && <li className="empty">유형을 추가하세요</li>}
      </ul>
    </aside>
  )
}
