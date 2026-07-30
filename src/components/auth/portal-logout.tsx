import { LogOut } from "lucide-react";
import { adminLogoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function PortalLogout() {
  return (
    <form action={adminLogoutAction} className="flex justify-end">
      <Button type="submit" variant="outline" size="sm" className="min-h-10">
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </form>
  );
}
