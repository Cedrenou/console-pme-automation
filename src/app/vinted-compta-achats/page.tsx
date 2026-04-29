import { redirect } from "next/navigation";

// Ancienne route conservée comme redirection vers la nouvelle page Compta unifiée.
// Tout lien vers /vinted-compta-achats arrive désormais sur l'onglet Achats.
const Page = () => {
  redirect("/compta?tab=achats");
};

export default Page;
