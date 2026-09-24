"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import {
  FIELD_DEFS,
  clampFontSize,
  defaultFieldConfig,
  isCustomKey,
  newCustomKey,
  resolveFieldValue,
  type FieldConfig,
  type FieldKey
} from "@/lib/fieldTypes";
import { SAMPLE_VALUES } from "@/lib/sampleValues";

const MAX_DISPLAY_WIDTH = 760;

/** Offered as one-click swatches so changing a colour never needs the OS picker. */
const COLOR_PRESETS = [
  "#1b2430",
  "#000000",
  "#ffffff",
  "#8a6d3b",
  "#b4914d",
  "#7a1f1f",
  "#1f4f7a",
  "#2f6b3f"
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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
  const [backgroundMissing, setBackgroundMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The hex box is its own state so a half-typed value like "#1b2" can sit in
  // the input without being pushed onto the field as an invalid colour.
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ type: "field" | "qr"; key?: FieldKey; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const scale = Math.min(1, MAX_DISPLAY_WIDTH / template.widthPx);
  const displayWidth = template.widthPx * scale;
  const displayHeight = template.heightPx * scale;

  const selectedField = fields.find((f) => f.key === selectedKey) ?? null;

  // Any edit invalidates the "Template saved." confirmation — leaving it up
  // while there are unsaved changes is how people lose work.
  function markDirty() {
    setSaved(false);
  }

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
      setSaved(false);
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
    select(field.key);
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

  function select(key: FieldKey | null) {
    setSelectedKey(key);
    setHexDraft(null);
  }

  function addField(def: { key: FieldKey; label: string }) {
    const cfg = defaultFieldConfig(def.key, def.label, template.widthPx, template.heightPx);
    // Stagger downward from whatever is already placed so a newly added field
    // never lands exactly under an existing one and look like nothing happened.
    cfg.y = clamp(
      Math.round(template.heightPx * (0.3 + fields.length * 0.1)),
      0,
      template.heightPx
    );
    setFields((prev) => [...prev, cfg]);
    select(def.key);
    markDirty();
  }

  function addCustomField() {
    addField({ key: newCustomKey(), label: "Custom text" });
  }

  function removeField(key: FieldKey) {
    const removedAt = fields.findIndex((f) => f.key === key);
    const next = fields.filter((f) => f.key !== key);
    setFields(next);
    if (selectedKey === key) {
      // Move the selection to a neighbour rather than clearing it. Clearing
      // hides the whole styling panel, which reads as the editor breaking.
      select(next[Math.min(removedAt, next.length - 1)]?.key ?? null);
    }
    markDirty();
  }

  function updateSelected(patch: Partial<FieldConfig>) {
    if (!selectedKey) return;
    setFields((prev) => prev.map((f) => (f.key === selectedKey ? { ...f, ...patch } : f)));
    markDirty();
  }

  function applyHexDraft(raw: string) {
    setHexDraft(raw);
    const candidate = raw.startsWith("#") ? raw : `#${raw}`;
    if (HEX_RE.test(candidate)) {
      updateSelected({ color: candidate.toLowerCase() });
    }
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

  /** What a field shows on the canvas: sample data, or the custom text itself. */
  function previewText(field: FieldConfig) {
    const value = resolveFieldValue(field, SAMPLE_VALUES);
    if (value) return value;
    // An empty custom field still needs to be visible and draggable.
    return isCustomKey(field.key) ? field.label : "";
  }

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
            onError={() => setBackgroundMissing(true)}
            onLoad={() => setBackgroundMissing(false)}
          />

          {/* Without this the editor just shows an empty box: the fields are
              still there and still draggable, but positioning them against
              nothing looks like the template failed to save. */}
          {backgroundMissing && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <p className="max-w-sm text-center text-sm text-danger">
                The template background could not be loaded, so field positions
                below are being placed against an empty canvas. Re-upload the
                template if this persists.
              </p>
            </div>
          )}

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
              {previewText(field)}
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
          Click a field to style it, drag it to reposition. Sample values are shown so you can judge
          placement — the real participant name, event and dates are filled in at generation time.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <p className="text-sm font-medium text-ink-900">Fields on certificate</p>
          {fields.length === 0 && (
            <p className="mt-2 text-xs text-ink-400">
              No fields on this template. Add one below.
            </p>
          )}
          <div className="mt-3 space-y-1">
            {fields.map((field) => (
              <button
                key={field.key}
                onClick={() => select(field.key)}
                className={clsx(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  field.key === selectedKey ? "bg-ink-900 text-paper" : "hover:bg-ink-50"
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                  style={{ backgroundColor: field.color }}
                />
                <span className="truncate">{field.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-xs text-ink-400">Add a field</p>
            <div className="flex flex-wrap gap-2">
              {availableToAdd.map((def) => (
                <Button key={def.key} variant="secondary" size="sm" onClick={() => addField(def)}>
                  + {def.label}
                </Button>
              ))}
              <Button variant="secondary" size="sm" onClick={addCustomField}>
                + Custom text
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Custom text prints the same words on every certificate — a citation line, a
              department, a signatory.
            </p>
          </div>
        </Card>

        <Card>
          {!selectedField ? (
            <p className="text-sm text-ink-400">
              Select a field above to change its size, font, alignment and colour.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-ink-900">{selectedField.label}</p>
                <button
                  onClick={() => removeField(selectedField.key)}
                  className="shrink-0 text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {isCustomKey(selectedField.key) && (
                  <>
                    <div>
                      <Label htmlFor="custom-text">Text to print</Label>
                      <Input
                        id="custom-text"
                        value={selectedField.text ?? ""}
                        maxLength={200}
                        placeholder="e.g. for outstanding performance"
                        onChange={(e) => updateSelected({ text: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="custom-label">Name in this list</Label>
                      <Input
                        id="custom-label"
                        value={selectedField.label}
                        maxLength={60}
                        onChange={(e) => updateSelected({ label: e.target.value })}
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label>Font size</Label>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    value={selectedField.fontSize}
                    onChange={(e) =>
                      updateSelected({ fontSize: clampFontSize(Number(e.target.value)) })
                    }
                    className="w-full"
                  />
                  <p className="text-xs text-ink-400">
                    {selectedField.fontSize}px on a {template.widthPx}×{template.heightPx} template
                  </p>
                </div>

                <div>
                  <Label htmlFor="font-family">Font family</Label>
                  <select
                    id="font-family"
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
                  <Label htmlFor="field-color">Colour</Label>
                  {/* Swatch plus hex box: the native picker opens an OS dialog,
                      which is easy to dismiss by accident, so typing a hex or
                      clicking a preset always works as a fallback. */}
                  <div className="flex items-center gap-2">
                    <input
                      id="field-color"
                      type="color"
                      value={selectedField.color}
                      onChange={(e) => {
                        setHexDraft(null);
                        updateSelected({ color: e.target.value });
                      }}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-white p-1"
                    />
                    <Input
                      aria-label="Colour hex value"
                      value={hexDraft ?? selectedField.color}
                      onChange={(e) => applyHexDraft(e.target.value)}
                      onBlur={() => setHexDraft(null)}
                      spellCheck={false}
                      maxLength={7}
                      className="font-mono uppercase"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        title={preset}
                        aria-label={`Use ${preset}`}
                        onClick={() => {
                          setHexDraft(null);
                          updateSelected({ color: preset });
                        }}
                        className={clsx(
                          "h-6 w-6 rounded border",
                          selectedField.color.toLowerCase() === preset
                            ? "border-seal ring-2 ring-seal/40"
                            : "border-black/20"
                        )}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-900">Verification QR code</p>
            <input
              type="checkbox"
              checked={qrEnabled}
              onChange={(e) => {
                setQrEnabled(e.target.checked);
                markDirty();
              }}
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
                onChange={(e) => {
                  setQrSize(Number(e.target.value));
                  markDirty();
                }}
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
