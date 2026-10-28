import { useState } from 'react'

// Historiales: muestra los primeros 5 y un botón "Ver más" que despliega todo
export default function Recortable({ items, hijo, cantidad = 5 }) {
  const [todo, setTodo] = useState(false)
  return (
    <>
      {hijo(todo ? items : items.slice(0, cantidad))}
      {items.length > cantidad && (
        <button type="button" className="enlace" onClick={() => setTodo(!todo)}>
          {todo ? 'Ver menos' : `Ver más (${items.length - cantidad} más)`}
        </button>
      )}
    </>
  )
}
