import { NextResponse } from 'next/server'
import os from 'os'

export const dynamic = 'force-dynamic'

function isPrivateIPv4(address: string): boolean {
  return (
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  )
}

export async function GET(req: Request) {
  const reqHost = new URL(req.url).hostname

  const isUnresolved = reqHost === 'localhost' || reqHost === '127.0.0.1' || reqHost === '0.0.0.0'

  // If the client already used a real IP/hostname, reflect it back
  if (!isUnresolved && isPrivateIPv4(reqHost)) {
    const port = new URL(req.url).port || '3000'
    return NextResponse.json({ host: `${reqHost}:${port}` })
  }

  // Find the first private IPv4 address (the LAN IP)
  const interfaces = os.networkInterfaces()
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && isPrivateIPv4(iface.address)) {
        const port = new URL(req.url).port || '3000'
        return NextResponse.json({ host: `${iface.address}:${port}` })
      }
    }
  }

  return NextResponse.json({ host: null })
}
