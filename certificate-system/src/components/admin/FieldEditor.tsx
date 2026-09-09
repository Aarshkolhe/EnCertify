"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { FIELD_DEFS, defaultFieldConfig, type FieldConfig, type FieldKey } from "@/lib/fieldTypes";
import { SAMPLE_VALUES } from "@/lib/sampleValues";

const MAX_DISPLAY_WIDTH = 760;

interface TemplateData {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  fields: FieldConfig[];
  qrEnabled: boolean;
  qrX: number | null;
  qrY: number | null;
  qrSize: number | null;
}

export function FieldEditor({ template }: { template: TemplateData }) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldConfig[]>(template.fields);
  const [qrEnabled, setQrEnabled] = useState(template.qrEnabled);
  const [qrX, setQrX] = useState(template.qrX ?? template.widthPx - 170);
  const [qrY, setQrY] = useState(template.qrY ?? template.heightPx - 170);
  const [qrSize, setQrSize] = useState(template.qrSize ?? 120);
  const [selectedKey, setSelectedKey] = useState<FieldKey | null>(fields[0]?.key ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ type: "field" | "qr"; key?: FieldKey; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const scale = Math.min(1, MAX_DISPLAY_WIDTH / template.widthPx);
  const displayWidth = template.widthPx * scale;
  const displayHeight = template.heightPx * scale;

  const selectedField = fields.find((f) => f.key === selectedKey) ?? null;

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const dxScreen = e.clientX - drag.startX;
      const dyScreen = e.clientY - drag.startY;
      const dx = dxScreen / scale;
      const dy = dyScreen / scale;

      if (drag.type === "field" && drag.key) {
        setFields((prev) =>
          prev.map((f) =>
            f.key === drag.key
              ? {
                  ...f,
                  x: clamp(Math.round(drag.origX + dx), 0, template.widthPx),
                  y: clamp(Math.round(drag.origY + dy), 0, template.heightPx)
                }
              : f
          )
        );
      } else if (drag.type === "qr") {
        setQrX(clamp(Math.round(drag.origX + dx), 0, template.widthPx - qrSize));
        setQrY(clamp(Math.round(drag.origY + dy), 0, template.heightPx - qrSize));
      }
    },
    [scale, template.widthPx, template.heightPx, qrSize]
  );

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  function startDragField(e: React.PointerEvent, field: FieldConfig) {
    e.preventDefault();
    setSelectedKey(field.key);
    dragState.current = {
      type: "field",
      key: field.key,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function startDragQr(e: React.PointerEvent) {
    e.preventDefault();
    dragState.current = { type: "qr", startX: e.clientX, startY: e.clientY, origX: qrX, origY: qrY };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove]);

  function addField(def: { key: FieldKey; label: string }) {
    const cfg = defaultFieldConfig(def.key, def.label, template.widthPx, template.heightPx);
    setFields((prev) => [...prev, cfg]);
    setSelectedKey(def.key);
  }

  function removeField(key: FieldKey) {
    setFields((prev) => prev.filter((f) => f.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  }

  function updateSelected(patch: Partial<FieldConfig>) {
    if (!selectedKey) return;
    setFields((prev) => prev.map((f) => (f.key === selectedKey ? { ...f, ...patch } : f)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, qrEnabled, qrX, qrY, qrSize })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save template.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const availableToAdd = FIELD_DEFS.filter((def) => !fields.some((f) => f.key === def.key));
  const qrDisplaySize = qrSize * scale;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden rounded border border-border bg-ink-50"
          style={{ width: displayWidth, height: displayHeight }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/admin/templates/${template.id}/preview`}
            alt={template.name}
            width={displayWidth}
            height={displayHeight}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />

          {fields.map((field) => (
            <div
              key={field.key}
              onPointerDown={(e) => startDragField(e, field)}
              className={clsx(
                "absolute cursor-move whitespace-nowrap rounded-sm border px-1",
                field.key === selectedKey
                  ? "border-seal bg-seal/10"
                  : "border-transparent hover:border-seal/50"
              )}
              style={{
                left: field.x * scale,
                top: field.y * scale,
                transform:
                  field.align === "center"
                    ? "translate(-50%, -50%)"
                    : field.align === "right"
                      ? "translate(-100%, -50%)"
                      : "translate(0, -50%)",
                fontSize: field.fontSize * scale,
                fontWeight: field.bold ? 700 : 400,
                fontStyle: field.italic ? "italic" : "normal",
                color: field.color,
                fontFamily:
                  field.fontFamily === "serif"
                    ? "Georgia, serif"
                    : field.fontFamily === "monospace"
                      ? "'Courier New', monospace"
                      : "Arial, sans-serif"
              }}
            >
              {SAMPLE_VALUES[field.key]}
            </div>
          ))}

          {qrEnabled && (
            <div
              onPointerDown={startDragQr}
              className="absolute flex cursor-move items-center justify-center border-2 border-dashed border-seal bg-seal/10 text-[10px] text-seal-dark"
              style={{
                left: qrX * scale,
                top: qrY * scale,
                width: qrDisplaySize,
                height: qrDisplaySize
              }}
            >
              QR
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Drag any field or the QR box to reposition it. Sample values are shown so you can judge placement.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <p className="text-sm font-medium text-ink-900">Fields on certificate</p>
          <div className="mt-3 space-y-1">
            {fields.map((field) => (
              <button
                key={field.key}
                onClick={() => setSelectedKey(field.key)}
                className={clsx(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm",
                  field.key === selectedKey ? "bg-ink-900 text-paper" : "hover:bg-ink-50"
                )}
              >
                {field.label}
              </button>
            ))}
          </div>
          {availableToAdd.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-xs text-ink-400">Add a field</p>
              <div className="flex flex-wrap gap-2">
                {availableToAdd.map((def) => (
                  <Button key={def.key} variant="secondary" size="sm" onClick={() => addField(def)}>
                    + {def.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {selectedField && (
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink-900">{selectedField.label}</p>
              <button
                onClick={() => removeField(selectedField.key)}
                className="text-xs text-danger hover:underline"
              >
                Remove
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <Label>Font size</Label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={selectedField.fontSize}
                  onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-ink-400">{selectedField.fontSize}px</p>
              </div>

              <div>
                <Label>Font family</Label>
                <select
                  value={selectedField.fontFamily}
                  onChange={(e) => updateSelected({ fontFamily: e.target.value as FieldConfig["fontFamily"] })}
                  className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
                >
                  <option value="serif">Serif</option>
                  <option value="sans-serif">Sans-serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </div>

              <div>
                <Label>Alignment</Label>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((align) => (
                    <Button
                      key={align}
                      variant={selectedField.align === align ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => updateSelected({ align })}
                    >
                      {align}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={selectedField.bold ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => updateSelected({ bold: !selectedField.bold })}
                >
                  Bold
                </Button>
                <Button
                  variant={selectedField.italic ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => updateSelected({ italic: !selectedField.italic })}
                >
                  Italic
                </Button>
              </div>

              <div>
                <Label>Color</Label>
                <input
                  type="color"
                  value={selectedField.color}
                  onChange={(e) => updateSelected({ color: e.target.value })}
                  className="h-9 w-full rounded border border-border"
                />
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-900">Verification QR code</p>
            <input
              type="checkbox"
              checked={qrEnabled}
              onChange={(e) => setQrEnabled(e.target.checked)}
            />
          </div>
          {qrEnabled && (
            <div className="mt-3">
              <Label>Size</Label>
              <input
                type="range"
                min={60}
                max={240}
                value={qrSize}
                onChange={(e) => setQrSize(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-ink-400">{qrSize}px — links to the public verification page</p>
            </div>
          )}
        </Card>

        {error && <Alert tone="danger">{error}</Alert>}
        {saved && <Alert tone="success">Template saved.</Alert>}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save template"}
        </Button>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
