import { redirect } from "next/navigation";

// Redirection legacy : /vinted-cockpit a été promu en page d'accueil.
// On garde cette route pour ne pas casser les bookmarks existants.
export default function VintedCockpitRedirect() {
  redirect("/");
}
