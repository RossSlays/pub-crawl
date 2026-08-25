import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div style={{
      background: 'linear-gradient(135deg, #c8793a 0%, #7a3420 100%)',
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 320,
    }}>
      🍺
    </div>,
    { ...size }
  )
}
