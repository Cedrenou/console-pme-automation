"use client";
import React, { useEffect, useMemo, useState } from "react";
import { fetchVintedCustomers, type VintedCustomer } from "@/lib/api";
import { FaSearch, FaUser, FaMapMarkerAlt, FaEnvelope, FaShoppingBag, FaEuroSign, FaTimes, FaExternalLinkAlt, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

const formatEur = (n: number): string =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatInt = (n: number): string => n.toLocaleString("fr-FR");

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
};

type SortKey = "ca_total" | "nb_commandes" | "derniere_commande" | "nom";
type SortDir = "asc" | "desc";

const VintedClientsPage = () => {
  const [items, setItems] = useState<VintedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ca_total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<VintedCustomer | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchVintedCustomers();
        if (!cancelled) setItems(res.items);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError("Erreur lors du chargement des clients.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Recherche full-text sur les champs texte les plus utiles côté secrétaire / Sunset
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(c => {
      const haystack = [
        c.nom, c.email, c.acheteur_username, c.ville, c.code_postal, c.pays
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "ca_total": cmp = a.ca_total - b.ca_total; break;
        case "nb_commandes": cmp = a.nb_commandes - b.nb_commandes; break;
        case "derniere_commande": cmp = a.derniere_commande.localeCompare(b.derniere_commande); break;
        case "nom": cmp = (a.nom ?? "").localeCompare(b.nom ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "nom" ? "asc" : "desc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <FaSort className="text-gray-600 text-[10px] ml-1" />;
    return sortDir === "asc"
      ? <FaSortUp className="text-blue-400 text-[10px] ml-1" />
      : <FaSortDown className="text-blue-400 text-[10px] ml-1" />;
  };

  const totalCa = useMemo(() => filtered.reduce((acc, c) => acc + c.ca_total, 0), [filtered]);
  const totalCommandes = useMemo(() => filtered.reduce((acc, c) => acc + c.nb_commandes, 0), [filtered]);
  const recurrents = useMemo(() => filtered.filter(c => c.nb_commandes > 1).length, [filtered]);

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Clients Sunset</h1>
          <p className="text-gray-400">Liste des acheteurs Vinted, agrégés par email — clic sur une ligne pour voir l&apos;historique.</p>
        </div>
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer par nom, email, ville..."
            className="pl-9 pr-3 py-2 rounded-lg bg-[#1c1f2e] border border-[#2c3048] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-72"
          />
        </div>
      </div>

      {/* Mini-KPI globaux pour donner du contexte */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiMini icon={<FaUser />} label="Clients uniques" value={formatInt(filtered.length)} accent="text-blue-400" />
        <KpiMini icon={<FaShoppingBag />} label="Commandes" value={formatInt(totalCommandes)} />
        <KpiMini icon={<FaEuroSign />} label="CA cumulé" value={formatEur(totalCa)} accent="text-emerald-400" />
        <KpiMini icon={<FaUser />} label="Clients récurrents" value={`${formatInt(recurrents)} / ${formatInt(filtered.length)}`} accent="text-amber-400" />
      </div>

      <div className="bg-[#23263A] rounded-2xl shadow-lg p-4">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-gray-400 italic py-8 text-center">Chargement des clients…</div>
        ) : sorted.length === 0 ? (
          <div className="text-gray-500 italic py-8 text-center">
            {search ? "Aucun client ne matche ce filtre." : "Aucun client en base."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-[#2c3048]">
                  <SortableHeader label="Nom" active={sortKey === "nom"} onClick={() => handleSort("nom")} icon={sortIcon("nom")} />
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Username</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Email</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Ville</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Pays</th>
                  <SortableHeader label="Commandes" align="right" active={sortKey === "nb_commandes"} onClick={() => handleSort("nb_commandes")} icon={sortIcon("nb_commandes")} />
                  <SortableHeader label="CA total" align="right" active={sortKey === "ca_total"} onClick={() => handleSort("ca_total")} icon={sortIcon("ca_total")} />
                  <SortableHeader label="Dernière commande" active={sortKey === "derniere_commande"} onClick={() => handleSort("derniere_commande")} icon={sortIcon("derniere_commande")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr
                    key={c.email}
                    onClick={() => setSelected(c)}
                    className="border-b border-[#2c3048] hover:bg-[#1c1f2e]/60 cursor-pointer"
                  >
                    <td className="py-2 px-3 text-sm font-medium whitespace-nowrap">{c.nom ?? <span className="text-gray-500 italic">—</span>}</td>
                    <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">{c.acheteur_username ?? "—"}</td>
                    <td className="py-2 px-3 text-xs text-gray-400 max-w-[14rem] truncate" title={c.email}>{c.email}</td>
                    <td className="py-2 px-3 text-sm text-gray-300 whitespace-nowrap">{c.ville ?? "—"}</td>
                    <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">{c.pays ?? "—"}</td>
                    <td className="py-2 px-3 text-sm text-right tabular-nums whitespace-nowrap">
                      {c.nb_commandes > 1
                        ? <span className="bg-amber-600/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold">{c.nb_commandes}</span>
                        : c.nb_commandes}
                    </td>
                    <td className="py-2 px-3 text-sm text-right tabular-nums whitespace-nowrap font-semibold text-emerald-400">{formatEur(c.ca_total)}</td>
                    <td className="py-2 px-3 text-xs text-gray-300 whitespace-nowrap tabular-nums">{formatDate(c.derniere_commande)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <ClientDrawer client={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const KpiMini: React.FC<{ icon: React.ReactNode; label: string; value: string; accent?: string }> = ({ icon, label, value, accent }) => (
  <div className="bg-[#23263A] rounded-2xl shadow p-4 flex items-center gap-3">
    <div className={`text-2xl ${accent ?? "text-gray-400"}`}>{icon}</div>
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  </div>
);

const SortableHeader: React.FC<{
  label: string;
  align?: "left" | "right";
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}> = ({ label, align = "left", active, onClick, icon }) => (
  <th className={`py-2 px-3 font-semibold whitespace-nowrap ${align === "right" ? "text-right" : ""}`}>
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer inline-flex items-center hover:text-blue-300 ${active ? "text-blue-300" : "text-gray-400"}`}
    >
      {label}
      {icon}
    </button>
  </th>
);

const ClientDrawer: React.FC<{ client: VintedCustomer; onClose: () => void }> = ({ client, onClose }) => {
  // Fermeture sur Echap pour matcher l'attendu UX d'un drawer/modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const fullAddress = [client.rue, [client.code_postal, client.ville].filter(Boolean).join(" "), client.pays]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-40"
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label={`Détail client ${client.nom ?? client.email}`}
        className="fixed top-0 right-0 bottom-0 w-full md:w-[520px] bg-[#1c1f2e] border-l border-[#2c3048] z-50 overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-[#1c1f2e] border-b border-[#2c3048] p-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold mb-1">{client.nom ?? <span className="text-gray-500">Nom inconnu</span>}</h2>
            {client.acheteur_username && (
              <div className="text-sm text-gray-400">@{client.acheteur_username}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="cursor-pointer p-2 rounded-md text-gray-400 hover:text-white hover:bg-[#2c3048] transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-[#23263A] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <FaEnvelope className="text-gray-500 mt-0.5 flex-shrink-0" />
              <span className="text-gray-300 break-all">{client.email}</span>
            </div>
            {fullAddress && (
              <div className="flex items-start gap-2">
                <FaMapMarkerAlt className="text-gray-500 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{fullAddress}</span>
              </div>
            )}
            {client.conversation_url && (
              <a
                href={client.conversation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:underline mt-1"
              >
                <FaExternalLinkAlt className="text-[11px]" />
                Conversation Vinted
              </a>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <DrawerStat label="Commandes" value={String(client.nb_commandes)} />
            <DrawerStat label="CA total" value={formatEur(client.ca_total)} accent="text-emerald-400" />
            <DrawerStat label="Première" value={formatDate(client.premiere_commande)} small />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2 mt-4">
              Historique des commandes ({client.orders.length})
            </h3>
            <div className="space-y-2">
              {client.orders.map(order => (
                <div key={order.gmailMessageId} className="bg-[#23263A] rounded-lg p-3 flex gap-3">
                  {order.article_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.article_image_url}
                      alt={order.article_titre ?? "article"}
                      className="w-14 h-16 object-cover rounded flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-14 h-16 bg-[#1c1f2e] rounded flex items-center justify-center text-gray-600 text-xs flex-shrink-0">—</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={order.article_titre ?? ""}>
                      {order.article_titre ?? <span className="text-gray-500 italic">Article sans titre</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 tabular-nums">
                      {formatDate(order.eventDate)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-bold text-emerald-400 tabular-nums">
                      {order.prix_vente !== null ? formatEur(order.prix_vente) : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

const DrawerStat: React.FC<{ label: string; value: string; accent?: string; small?: boolean }> = ({ label, value, accent, small }) => (
  <div className="bg-[#23263A] rounded-lg p-3">
    <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
    <div className={`font-bold ${small ? "text-xs" : "text-base"} ${accent ?? ""}`}>{value}</div>
  </div>
);

export default VintedClientsPage;
