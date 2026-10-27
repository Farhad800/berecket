import { redirect } from "next/navigation";

/** Suppliers are customers now (owner, 27 Oct 2026): old links and bookmarks land on the one Customers list. */
export default function SuppliersPage() {
  redirect("/customers");
}
