import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleOptions, jsonResponse } from "@/lib/publicApiCors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          certificates: {
            where: { status: "VALID" }
          }
        }
      }
    },
    orderBy: { date: "desc" }
  });

  const formattedEvents = events.map((event) => ({
    id: event.id,
    name: event.name,
    issuedCount: event._count.certificates
  }));

  // Semesters field does not exist in schema, so return empty array as specified
  return jsonResponse(
    {
      events: formattedEvents,
      semesters: []
    },
    req,
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60"
      }
    }
  );
}
