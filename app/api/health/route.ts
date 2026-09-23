export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({
    ok: true,
    service: "felt-friends",
    time: new Date().toISOString(),
  })
}
