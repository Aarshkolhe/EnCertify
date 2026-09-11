"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { readError, readJson } from "@/lib/fetchJson";

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a template file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("file", file);
      const res = await fetch("/api/admin/templates/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readError(res, "Upload failed."));
      const data = await readJson<{ template?: { id: string } }>(res);
      if (!data?.template?.id) throw new Error("The server did not return the new template.");
      // The templates list is a server component sitting in the client router
      // cache. Without this the new template is missing from it for ~30s after
      // a successful upload, which reads as "the upload did nothing".
      router.refresh();
      router.push(`/admin/templates/${data.template.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl text-ink-900">Create certificate template</h1>
      <Card className="mt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Template name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tech Fest Certificate"
              required
            />
          </div>
          <div>
            <Label htmlFor="file">Template file (PNG, JPG, or PDF)</Label>
            <input
              id="file"
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-ink-700"
              required
            />
            <p className="mt-1 text-xs text-ink-400">
              Max 10MB. Print-resolution designs are fine — anything over 4000px
              is scaled down automatically. PDFs are converted to an image
              automatically; only page 1 is used.
            </p>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={loading}>
            {loading ? "Uploading…" : "Upload & continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
