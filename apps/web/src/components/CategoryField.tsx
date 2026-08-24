import { useEffect, useState } from "react";
import type { Category } from "@ledger/shared";
import { api } from "../api";

const CUSTOM = "__custom__";

type Props = { value: string; onChange: (value: string) => void };

export function CategoryField({ value, onChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.categories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoaded(true));
  }, []);

  const known = categories.some((category) => category.name.toLowerCase() === value.trim().toLowerCase());
  const customMode = loaded && categories.length > 0 && value.trim() !== "" && !known;

  async function saveToList() {
    const name = value.trim();
    if (!name) return;
    setSaving(true); setError("");
    try {
      const saved = await api.addCategory(name);
      setCategories((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(saved.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category");
    } finally { setSaving(false); }
  }

  return <label>Category
    <select
      value={customMode ? CUSTOM : value}
      onChange={(event) => onChange(event.target.value === CUSTOM ? "" : event.target.value)}
    >
      {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
      <option value={CUSTOM}>Custom category…</option>
    </select>
    {(customMode || (loaded && value === "")) && <div className="category-custom">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type a category name"
        maxLength={40}
        required
      />
      <button type="button" className="secondary small" onClick={() => void saveToList()} disabled={saving || !value.trim()}>
        {saving ? "Saving…" : "Save to list"}
      </button>
    </div>}
    {error && <div className="error">{error}</div>}
  </label>;
}
