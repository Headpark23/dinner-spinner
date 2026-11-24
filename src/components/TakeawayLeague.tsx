import React, { useState } from 'react';
import { ChevronDown, Plus, MapPin, Phone, Globe, Star, Search, UsersRound, ThumbsUp, ThumbsDown, EyeOff, Navigation, RefreshCw } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { orderLinks, ratingId, type LeagueRow } from '../utils/takeaways';
import { Button, Card, Select, TextInput, cx } from './ui';

const Stars: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
  <span className={cx('inline-flex', className)} aria-hidden="true">
    {[1, 2, 3, 4, 5].map((s) => (
      <Star
        key={s}
        className={cx('h-3.5 w-3.5', s <= Math.round(value) ? 'fill-saffron text-saffron' : 'text-line-strong')}
        strokeWidth={1.5}
      />
    ))}
  </span>
);

/** Your own score, likes and dislikes for one takeaway. Saved under your name; everyone sees it. */
export const RatePanel: React.FC<{ spotId: string; spotName: string; onDone?: () => void }> = ({ spotId, spotName, onDone }) => {
  const { shared, whoAmI, householdMembers, setMeId } = useDinner();
  const mine = shared.hub.ratings.find((r) => r.id === ratingId(spotId, whoAmI));
  const [stars, setStars] = useState(mine?.stars || 0);
  const [likes, setLikes] = useState(mine?.likes || '');
  const [dislikes, setDislikes] = useState(mine?.dislikes || '');
  const [saved, setSaved] = useState(false);

  // Switching who you are re-loads that person's own score.
  const switchTo = (memberId: string) => {
    const member = householdMembers.find((m) => m.id === memberId);
    setMeId(memberId);
    const theirs = member && shared.hub.ratings.find((r) => r.id === ratingId(spotId, member.name));
    setStars(theirs?.stars || 0);
    setLikes(theirs?.likes || '');
    setDislikes(theirs?.dislikes || '');
    setSaved(false);
  };

  return (
    <div className="rounded-xl bg-sunk p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        {householdMembers.length > 1 ? (
          <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-2">
            Scoring as
            <Select
              value={householdMembers.find((m) => m.name === whoAmI)?.id || ''}
              onChange={(e) => switchTo(e.target.value)}
              aria-label="Who is scoring"
              className="h-9 w-auto py-0 text-[13px]"
            >
              {householdMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <span className="whitespace-nowrap text-[13px] text-ink-2">
            Scoring as <strong className="font-semibold text-ink">{whoAmI}</strong>
          </span>
        )}
        <div className="flex" role="radiogroup" aria-label={`${whoAmI}'s score for ${spotName}`}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={stars === s}
              aria-label={`${s} star${s > 1 ? 's' : ''}`}
              onClick={() => {
                setStars(stars === s ? 0 : s);
                setSaved(false);
              }}
              className="flex h-11 w-9 items-center justify-center"
            >
              <Star className={cx('h-6 w-6', s <= stars ? 'fill-saffron text-saffron' : 'text-line-strong')} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 space-y-2">
        <TextInput
          value={likes}
          onChange={(e) => {
            setLikes(e.target.value);
            setSaved(false);
          }}
          placeholder="What we like, e.g. great naan"
          aria-label="What we like"
          maxLength={200}
          className="h-10 text-[14px]"
        />
        <TextInput
          value={dislikes}
          onChange={(e) => {
            setDislikes(e.target.value);
            setSaved(false);
          }}
          placeholder="What we don’t, e.g. slow on Fridays"
          aria-label="What we don’t like"
          maxLength={200}
          className="h-10 text-[14px]"
        />
        <Button
          variant="primary"
          block
          disabled={stars === 0 && !mine}
          onClick={() => {
            shared.rate(spotId, whoAmI, stars, likes, dislikes);
            setSaved(true);
            onDone?.();
          }}
        >
          {stars === 0 && mine ? 'Take my score back' : saved ? 'Saved' : 'Save my score'}
        </Button>
      </div>
    </div>
  );
};

const LINK = 'inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-ink-2';

const LeagueItem: React.FC<{ row: LeagueRow; rank: number | null; open: boolean; onToggle: () => void }> = ({ row, rank, open, onToggle }) => {
  const { shared } = useDinner();
  const { spot } = row;
  const links = orderLinks(spot, shared.hub.place?.label);
  return (
    <li className="py-1">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-sunk"
      >
        <span
          className={cx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums',
            rank === 1 ? 'bg-brass text-white' : rank ? 'bg-sunk text-ink-2' : 'text-ink-3'
          )}
        >
          {rank ?? '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{spot.name}</span>
          <span className="block truncate text-[12px] text-ink-2">
            {spot.cuisine}
            {spot.address ? ` · ${spot.address}` : ''}
          </span>
          {row.scores.length > 0 && (
            <span className="block truncate text-[12px] text-ink-3">Scored by {row.scores.map((r) => r.who).join(', ')}</span>
          )}
        </span>
        <span className="shrink-0 text-right">
          {row.votes > 0 ? (
            <>
              <span className="block font-display text-[17px] font-semibold tabular-nums leading-none">{row.average.toFixed(1)}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3">
                {row.votes} {row.votes === 1 ? 'vote' : 'votes'}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-ink-3">Not scored</span>
          )}
        </span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="fade-up space-y-3 px-1 pb-3 pt-1">
          {spot.gone && (
            <p className="rounded-lg bg-sunk px-3 py-2 text-[13px] text-ink-2">
              This place has dropped off the map, so it may have closed. Your scores are kept.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {spot.phone && (
              <a href={`tel:${spot.phone.replace(/[^\d+]/g, '')}`} className={LINK}>
                <Phone className="h-4 w-4" /> {spot.phone}
              </a>
            )}
            {links.website && (
              <a href={links.website} target="_blank" rel="noopener noreferrer" className={LINK}>
                <Globe className="h-4 w-4" /> Website
              </a>
            )}
            <a href={links.directions} target="_blank" rel="noopener noreferrer" className={LINK}>
              <Navigation className="h-4 w-4" /> Directions
            </a>
          </div>
          <div>
            <p className="mb-1 text-[12px] text-ink-3">Order online (opens a search for this shop)</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['Just Eat', links.justEat],
                ['Uber Eats', links.uberEats],
                ['Deliveroo', links.deliveroo],
              ].map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {label}
                </a>
              ))}
            </div>
          </div>

          {row.scores.length > 0 && (
            <ul className="space-y-2">
              {row.scores.map((r) => (
                <li key={r.id} className="text-[14px]">
                  <span className="font-semibold">{r.who}</span> <Stars value={r.stars} className="ml-1 translate-y-0.5" />
                  <span className="sr-only">{r.stars} stars</span>
                  {r.likes && (
                    <span className="mt-0.5 flex items-start gap-1.5 text-ink-2">
                      <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" /> {r.likes}
                    </span>
                  )}
                  {r.dislikes && (
                    <span className="mt-0.5 flex items-start gap-1.5 text-ink-2">
                      <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tomato" /> {r.dislikes}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <RatePanel spotId={spot.id} spotName={spot.name} />

          <button
            onClick={() => shared.hideSpot(spot.id, true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
          >
            <EyeOff className="h-4 w-4" /> Not for us, hide it
          </button>
        </div>
      )}
    </li>
  );
};

/** Add a place the map missed, by pasting its website. We read the page for the details; the person checks them first. */
const AddPlace: React.FC = () => {
  const { shared, whoAmI } = useDinner();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [coords, setCoords] = useState<{ lat?: number; lon?: number }>({});
  const [website, setWebsite] = useState('');
  const [note, setNote] = useState('');

  const reset = () => {
    setUrl('');
    setName('');
    setCuisine('');
    setAddress('');
    setPhone('');
    setCoords({});
    setWebsite('');
    setNote('');
  };

  const lookup = async () => {
    setNote('');
    const r = await shared.lookupLink(url);
    if (r.website) setWebsite(r.website);
    if (r.details) {
      setName(r.details.name);
      setCuisine(r.details.cuisine || '');
      setAddress(r.details.address || '');
      setPhone(r.details.phone || '');
      setCoords({ lat: r.details.lat, lon: r.details.lon });
    }
    setNote(r.message);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink">
        <Plus className="h-4 w-4" /> Missing a place? Add it from its website
      </button>
    );
  }

  return (
    <form
      className="fade-up space-y-2 rounded-2xl border border-line bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        shared.addSpot(name.trim(), cuisine.trim() || 'Takeaway', whoAmI, {
          website: website || url.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          ...coords,
        });
        reset();
        setOpen(false);
      }}
    >
      <p className="text-[14px] font-semibold">Add a place the map missed</p>
      <label htmlFor="place-url" className="block text-[13px] text-ink-2">
        Paste its website and we’ll fill in the details.
      </label>
      <div className="flex gap-2">
        <TextInput
          id="place-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.thegoldenwok.co.uk"
        />
        <Button type="button" variant="secondary" disabled={shared.busy || !url.trim()} onClick={lookup}>
          {shared.busy ? 'Reading…' : 'Look up'}
        </Button>
      </div>
      {note && (
        <p role="status" className="text-[13px] text-ink-2">
          {note}
        </p>
      )}
      <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. The Golden Wok" aria-label="Name" maxLength={80} />
      <div className="grid grid-cols-2 gap-2">
        <TextInput value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Cuisine (optional)" aria-label="Cuisine" maxLength={40} />
        <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" aria-label="Phone" inputMode="tel" maxLength={30} />
      </div>
      <TextInput value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" aria-label="Address" maxLength={120} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Add to the league
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

/** Local takeaways for the family group: find them, score them, and see the favourites. Family groups only. */
export const LocalTakeaways: React.FC<{ onOpenFamily?: () => void }> = ({ onOpenFamily }) => {
  const { householdCode, shared } = useDinner();
  const [town, setTown] = useState('');
  const [radius, setRadius] = useState(3000);
  const [message, setMessage] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  if (!householdCode) {
    return (
      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <MapPin className="h-4 w-4 text-ink-2" /> Takeaways near you
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">
          Find the takeaways in your town, then score them together. Everyone’s scores combine into a family league
          table. This lives in your family group, so start one first.
        </p>
        {onOpenFamily && (
          <Button variant="secondary" block className="mt-3" onClick={onOpenFamily}>
            <UsersRound className="h-4 w-4" /> Start a family group
          </Button>
        )}
      </Card>
    );
  }

  const place = shared.hub.place;
  const scored = shared.league.filter((r) => r.votes > 0);
  const unscored = shared.league.filter((r) => r.votes === 0);

  const run = async (find: boolean) => {
    setMessage('');
    if (find) {
      const found = await shared.findTown(town);
      if (!found.ok) return setMessage(found.message);
      setChanging(false);
      setTown('');
    }
    const result = await shared.discover(radius);
    setMessage(result.message);
  };

  const showForm = !place || changing;

  return (
    <section aria-labelledby="league-h" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="league-h" className="font-display text-[22px] leading-tight font-semibold">
            Family league
          </h2>
          <p className="text-[13px] text-ink-2">
            {place ? (
              <>
                Takeaways near <strong className="font-semibold text-ink">{place.label}</strong>
              </>
            ) : (
              'Find the takeaways in your town.'
            )}
          </p>
        </div>
        {place && !changing && (
          <button onClick={() => setChanging(true)} className="min-h-11 shrink-0 px-1 text-[13px] font-semibold text-ink-2 underline">
            Change town
          </button>
        )}
      </div>

      {showForm && (
        <form
          className="space-y-2 rounded-2xl border border-line bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (town.trim().length >= 2) run(true);
          }}
        >
          <label htmlFor="town" className="text-[13px] font-semibold">
            Your town or postcode
          </label>
          <div className="flex gap-2">
            <TextInput
              id="town"
              value={town}
              onChange={(e) => setTown(e.target.value)}
              placeholder="e.g. Harrogate or HG1 1AA"
              autoComplete="off"
              maxLength={80}
            />
            <Button type="submit" variant="primary" disabled={shared.busy || town.trim().length < 2}>
              <Search className="h-4 w-4" /> {shared.busy ? 'Looking…' : 'Find'}
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">
            We only look the place up on the map. We never use your phone’s location. {place && (
              <button type="button" onClick={() => setChanging(false)} className="font-semibold underline">
                Cancel
              </button>
            )}
          </p>
        </form>
      )}

      {place && !changing && !place.searchedAt && (
        <div className="flex items-center gap-2">
          <Select value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="How far to look" className="w-auto">
            <option value={1500}>Within 1 mile</option>
            <option value={3000}>Within 2 miles</option>
            <option value={5000}>Within 3 miles</option>
            <option value={8000}>Within 5 miles</option>
          </Select>
          <Button variant="secondary" onClick={() => run(false)} disabled={shared.busy}>
            <Search className="h-4 w-4" /> {shared.busy ? 'Searching…' : 'Find takeaways'}
          </Button>
        </div>
      )}
      {place && !changing && place.searchedAt && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-sunk px-3 py-2">
          <p className="min-w-0 text-[13px] text-ink-2">
            Searched {new Date(place.searchedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            {place.found ? ` · ${place.found} places` : ''}. New or closed? Refresh the list.
          </p>
          <Button variant="secondary" size="sm" onClick={() => run(false)} disabled={shared.busy} className="shrink-0">
            <RefreshCw className={cx('h-4 w-4', shared.busy && 'animate-spin')} /> {shared.busy ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      )}

      <p role="status" aria-live="polite" className={cx('text-[13px]', message ? 'text-ink-2' : 'sr-only')}>
        {message}
      </p>
      {shared.online === false && <p className="text-[12px] text-ink-3">Offline. Your scores will be sent when you’re back.</p>}

      {shared.league.length > 0 && (
        <Card className="px-3 py-1">
          <ul className="divide-y divide-line">
            {scored.map((row, i) => (
              <LeagueItem
                key={row.spot.id}
                row={row}
                rank={i + 1}
                open={openId === row.spot.id}
                onToggle={() => setOpenId(openId === row.spot.id ? null : row.spot.id)}
              />
            ))}
            {unscored.length > 0 && scored.length > 0 && (
              <li className="py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Not scored yet</li>
            )}
            {unscored.map((row) => (
              <LeagueItem
                key={row.spot.id}
                row={row}
                rank={null}
                open={openId === row.spot.id}
                onToggle={() => setOpenId(openId === row.spot.id ? null : row.spot.id)}
              />
            ))}
          </ul>
        </Card>
      )}

      {shared.league.length === 0 && place && !changing && !shared.busy && !message && (
        <p className="text-[14px] text-ink-2">Nothing yet. Tap “Find takeaways”, or add a favourite by hand below.</p>
      )}

      <AddPlace />

      <p className="text-[11px] text-ink-3">Places from Google Maps and OpenStreetMap contributors (openstreetmap.org/copyright).</p>
    </section>
  );
};
