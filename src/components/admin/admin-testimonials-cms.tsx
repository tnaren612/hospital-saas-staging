"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Pencil, Plus, Star, Trash2, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/ui/page-header";
import {
  createTestimonial,
  deleteTestimonial,
  getAllTestimonials,
  resetTestimonialsToDefaults,
  updateTestimonial,
} from "@/lib/testimonials/service";
import type { Testimonial } from "@/types";
import { formatDate, cn } from "@/lib/utils";

const emptyForm = {
  name: "",
  role: "",
  treatment: "",
  content: "",
  rating: 5,
  image: "/assets/images/placeholders/avatar.svg",
  date: new Date().toISOString().slice(0, 10),
  featured: true,
  published: true,
};

export function AdminTestimonialsCms() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    setItems(getAllTestimonials());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(item: Testimonial) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      role: item.role,
      treatment: item.treatment || item.role,
      content: item.content,
      rating: item.rating,
      image: item.image,
      date: item.date,
      featured: Boolean(item.featured),
      published: item.published !== false,
    });
    setShowForm(true);
  }

  function handleSave() {
    if (form.name.trim().length < 2) {
      toast.error("Name is required");
      return;
    }
    if (form.content.trim().length < 10) {
      toast.error("Review must be at least 10 characters");
      return;
    }

    if (editingId) {
      updateTestimonial(editingId, form);
      toast.success("Testimonial updated");
    } else {
      createTestimonial(form);
      toast.success("Testimonial created");
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    reload();
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this testimonial?")) return;
    deleteTestimonial(id);
    toast.success("Deleted");
    reload();
  }

  function handleReset() {
    if (!confirm("Reset all testimonials to defaults? CMS edits will be lost."))
      return;
    resetTestimonialsToDefaults();
    toast.success("Reset to defaults");
    reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testimonials"
        description="Manage patient stories shown on the homepage carousel and testimonials page."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> Reset defaults
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add testimonial
            </Button>
          </div>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h3 className="font-semibold">
              {editingId ? "Edit testimonial" : "New testimonial"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="t-name">Patient name</Label>
                <Input
                  id="t-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="t-role">Role / relation</Label>
                <Input
                  id="t-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="Asthma Patient"
                />
              </div>
              <div>
                <Label htmlFor="t-treatment">Treatment</Label>
                <Input
                  id="t-treatment"
                  value={form.treatment}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, treatment: e.target.value }))
                  }
                  placeholder="COPD Care"
                />
              </div>
              <div>
                <Label htmlFor="t-date">Date</Label>
                <Input
                  id="t-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="t-rating">Rating (1–5)</Label>
                <Input
                  id="t-rating"
                  type="number"
                  min={1}
                  max={5}
                  value={form.rating}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rating: Number(e.target.value) || 5 }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="t-image">Photo URL</Label>
                <Input
                  id="t-image"
                  value={form.image}
                  onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                  placeholder="/assets/images/testimonials/patient-1.svg"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="t-content">Review</Label>
              <Textarea
                id="t-content"
                rows={4}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, featured: e.target.checked }))
                  }
                />
                Featured on homepage
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, published: e.target.checked }))
                  }
                />
                Published
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave}>Save</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full bg-muted">
                    <Image
                      src={item.image || "/assets/images/placeholders/avatar.svg"}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized
                    />
                  </div>
                  <div>
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.treatment || item.role}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {item.featured && <Badge variant="teal">Featured</Badge>}
                  {item.published === false && (
                    <Badge variant="secondary">Hidden</Badge>
                  )}
                </div>
              </div>
              <div className="mb-2 flex gap-0.5">
                {Array.from({ length: item.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-gold text-gold" />
                ))}
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {item.content}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  {formatDate(item.date)}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(item)}
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn("text-destructive")}
                    onClick={() => handleDelete(item.id)}
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
          No testimonials yet. Add one to get started.
        </div>
      )}
    </div>
  );
}
