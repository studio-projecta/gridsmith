import { useEffect } from 'react'
import { useStore } from './store/useStore'
import TypeSidebar from './components/TypeSidebar'
import Workspace from './components/Workspace'

export default function App() {
  const init = useStore((s) => s.init)
  const selectedTypeId = useStore((s) => s.selectedTypeId)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="layout">
      <TypeSidebar />

      <main className="main">
        {selectedTypeId ? (
          <Workspace />
        ) : (
          <div className="hero">
            <h1>Gridsmith</h1>
            <p>왼쪽에서 그룹유형을 추가하고 이미지를 업로드하세요.</p>
          </div>
        )}
      </main>
    </div>
  )
}
