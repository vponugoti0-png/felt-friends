import { TableScreen } from "@/components/felt/table-screen"

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <TableScreen code={code.toUpperCase()} />
}
