import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function AdminTemplatesPage() {
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { certificates: true } } }
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">Certificate templates</h1>
        <Link href="/admin/templates/new">
          <Button>+ Create template</Button>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <p className="text-sm text-ink-400">
              No templates yet. Upload a certificate design to get started.
            </p>
          </Card>
        )}
        {templates.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden rounded border border-border bg-ink-50">
              {/* Template previews are plain images with no participant data, safe to serve directly. */}
              <Image
                src={`/api/admin/templates/${template.id}/preview`}
                alt={template.name}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <p className="mt-3 font-medium text-ink-900">{template.name}</p>
            <p className="text-xs text-ink-400">{template._count.certificates} certificates issued</p>
            <Link href={`/admin/templates/${template.id}/edit`} className="mt-3">
              <Button variant="secondary" size="sm" className="w-full">
                Edit fields
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
