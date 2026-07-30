"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CmsAnnouncement,
  CmsNavigationItem,
  CmsNavigationLocation,
} from "@/lib/cms/types";

type NavigationState = Record<CmsNavigationLocation, CmsNavigationItem[]>;

const EMPTY_NAVIGATION: NavigationState = {
  header: [],
  footer: [],
  utility: [],
};

export function AdminSiteCms() {
  const [navigation, setNavigation] = useState<NavigationState>(EMPTY_NAVIGATION);
  const [announcement, setAnnouncement] = useState<CmsAnnouncement>({
    id: "",
    title: "",
    message: "",
    link_url: "",
    starts_at: null,
    ends_at: null,
    status: "draft",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/cms/site", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load site settings");
      setNavigation(json.data.navigation || EMPTY_NAVIGATION);
      if (json.data.announcements?.[0]) setAnnouncement(json.data.announcements[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load site settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNavigation = async (location: CmsNavigationLocation) => {
    setSaving(location);
    try {
      const response = await fetch("/api/admin/cms/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "navigation", location, items: navigation[location] }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to save navigation");
      toast.success(`${location} navigation saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save navigation");
    } finally {
      setSaving("");
    }
  };

  const parseNavigation = (location: CmsNavigationLocation, value: string) => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error();
      setNavigation({ ...navigation, [location]: parsed });
    } catch {
      // Keep the last valid value while the administrator is editing JSON.
    }
  };

  const saveAnnouncement = async () => {
    setSaving("announcement");
    try {
      const response = await fetch("/api/admin/cms/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "announcement",
          ...(announcement.id ? { id: announcement.id } : {}),
          title: announcement.title,
          message: announcement.message,
          link_url: announcement.link_url,
          starts_at: announcement.starts_at,
          ends_at: announcement.ends_at,
          status: announcement.status,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to save announcement");
      setAnnouncement(json.data);
      toast.success("Announcement saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save announcement");
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Navigation and announcements</h2>
        <p className="text-sm text-muted-foreground">
          Configure tenant-specific menus and the public announcement banner.
        </p>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading site settings…
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {(["header", "footer", "utility"] as const).map((location) => (
            <Card key={location}>
              <CardContent className="space-y-3 p-5">
                <Label className="capitalize">{location} navigation (JSON)</Label>
                <Textarea
                  className="min-h-48 font-mono text-xs"
                  defaultValue={JSON.stringify(navigation[location], null, 2)}
                  onBlur={(event) => parseNavigation(location, event.target.value)}
                  aria-label={`${location} navigation JSON`}
                />
                <Button
                  size="sm"
                  onClick={() => void saveNavigation(location)}
                  disabled={Boolean(saving)}
                >
                  {saving === location ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save {location}
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="space-y-3 p-5">
              <Label>Announcement title</Label>
              <Input
                value={announcement.title}
                onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })}
              />
              <Label>Message</Label>
              <Textarea
                value={announcement.message}
                onChange={(event) => setAnnouncement({ ...announcement, message: event.target.value })}
              />
              <Label>Optional link</Label>
              <Input
                value={announcement.link_url}
                onChange={(event) => setAnnouncement({ ...announcement, link_url: event.target.value })}
              />
              <Label>Status</Label>
              <select
                className="flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={announcement.status}
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    status: event.target.value as CmsAnnouncement["status"],
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <Button onClick={() => void saveAnnouncement()} disabled={Boolean(saving)}>
                {saving === "announcement" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save announcement
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
