"use client";

import { useEffect, useId, useRef, useState } from "react";
import { mapTilerSearchUrl, parseMapTilerSuggestions, type AddressSuggestion } from "@/lib/geocoding";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
};

export function AddressAutocomplete({ value, onChange, onSelect }: Props) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedValue = useRef("");
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() ?? "";

  useEffect(() => {
    const query = value.trim();
    if (!apiKey || query.length < 3 || query === selectedValue.current) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(mapTilerSearchUrl(query, apiKey), { signal: controller.signal });
        if (!response.ok) throw new Error("geocoding failed");
        const next = parseMapTilerSuggestions(await response.json());
        setSuggestions(next);
        setOpen(true);
        setActiveIndex(-1);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setSuggestions([]);
        setError("Aadressi soovitusi ei õnnestunud laadida.");
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiKey, value]);

  function choose(suggestion: AddressSuggestion) {
    selectedValue.current = suggestion.label;
    setOpen(false);
    setSuggestions([]);
    setError(null);
    onSelect(suggestion);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <label className="relative block">
      <span className="field-label">Aadress</span>
      <div className="relative">
        <input
          className="control bg-bg pr-9"
          placeholder="Alusta tänava või koha sisestamist"
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          onChange={(event) => {
            selectedValue.current = "";
            onChange(event.target.value);
          }}
          onFocus={() => value.trim().length >= 3 && (suggestions.length > 0 || error) && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className="absolute inset-y-0 right-3 flex items-center text-xs text-muted" aria-hidden="true">Otsin…</span>}
      </div>
      {!apiKey && <span className="field-hint block">Automaatsed soovitused vajavad MapTileri võtit. Aadressi saab otsida alloleva nupuga.</span>}
      {open && (
        <div id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
          {error ? (
            <p className="px-3 py-2 text-sm text-alert" role="alert">{error}</p>
          ) : suggestions.length > 0 ? suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              className={`block w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors ${activeIndex === index ? "bg-primary/10 text-primary" : "hover:bg-bg"}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(suggestion)}
            >
              <span className="block break-words">{suggestion.label}</span>
            </button>
          )) : !loading ? (
            <p className="px-3 py-2 text-sm text-muted">Sobivaid aadresse ei leitud. Täpsusta otsingut.</p>
          ) : null}
        </div>
      )}
    </label>
  );
}
