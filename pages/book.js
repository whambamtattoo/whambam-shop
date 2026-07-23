import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

export default function BookPage() {
  const router = useRouter()
  const { flash } = router.query
  const [design, setDesign] = useState(null)

  useEffect(() => {
    if (!flash) return
    fetch('https://whambam-shop.vercel.app/api/flash-designs')
      .then((res) => res.json())
      .then((data) => {
        const match = (data.designs || []).find((d) => String(d.id) === String(flash))
        setDesign(match || null)
      })
  }, [flash])

  return (
    <div style={{ padding: '40px' }}>
      {design && (
        <div style={{ marginBottom: '24px' }}>
          <img
            src={design.image_url}
            alt=""
            style={{ maxWidth: '200px', borderRadius: '8px' }}
          />
          <p>Selected design: {Array.isArray(design.subject) ? design.subject.join(', ') : ''}</p>
        </div>
      )}
      {/* Slot picker and booking form go here next */}
    </div>
  )
}
