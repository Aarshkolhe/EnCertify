import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FieldEditor } from "@/components/admin/FieldEditor";
import type { FieldConfig } from "@/lib/fieldTypes";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const template = await prisma.template.findUnique({ where: { id: params.id } });
  if (!template) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">{template.name}</h1>
      <p className="mt-1 text-sm text-ink-400">
        Position each field, then save. These positions are used for every certificate generated with this template.
      </p>
      <div className="mt-6">
        <FieldEditor
          template={{
            id: template.id,
            name: template.name,
            widthPx: template.widthPx,
            heightPx: template.heightPx,
            fields: template.fields as unknown as FieldConfig[],
            qrEnabled: template.qrEnabled,
            qrX: template.qrX,
            qrY: template.qrY,
            qrSize: template.qrSize
          }}
        />
      </div>
    </div>
  );
}
