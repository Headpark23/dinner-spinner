import React, { useRef, useState } from 'react';
import { useDinner } from '../../context/DinnerContext';
import {
  Camera,
  Receipt,
  BookOpen,
  Plus,
  Trash2,
  CircleCheck,
  CircleAlert,
  ShoppingBasket,
  Check,
  Star,
  X,
  Heart,
  Search,
  Send,
  Dices,
  Sparkles,
  Copy,
  LoaderCircle,
} from 'lucide-react';
import { FreshnessLevel, Meal, TimeStake, EffortLevel } from '../../types';
import { RecipeSheet } from '../RecipeSheet';
import { photoFor } from '../../data/photos';
import { INITIAL_MEALS } from '../../data/initialData';
import {
  Button,
  Card,
  Chip,
  DishTile,
  FreshDot,
  IconButton,
  Notice,
  Select,
  TextInput,
  Segmented,
  cx,
  freshnessLabel,
  timeLabel,
  effortLabel,
} from '../ui';

type Tab = 'fridge' | 'vault' | 'missing' | 'camera' | 'staples' | 'banned';
type ScanType = 'snap-fridge' | 'scan-receipt' | 'recipe-photo' | 'recipe-text';

const readInitialTab = (): Tab => {
  try {
    const t = sessionStorage.getItem('ds_pantry_tab') as Tab | null;
    sessionStorage.removeItem('ds_pantry_tab');
    if (t && ['fridge', 'vault', 'missing', 'camera', 'staples', 'banned'].includes(t)) return t;
  } catch {
    // ignore
  }
  return 'fridge';
};

const CHIP_LIST_INPUT = 'flex gap-2 border-t border-line pt-3';

export const PantryView: React.FC = () => {
  const {
    pantry,
    togglePantryFreshness,
    addPantryItem,
    removePantryItem,
    staples,
    addStaple,
    removeStaple,
    bannedIngredients,
    toggleBannedIngredient,
    meals,
    addMeal,
    deleteMeal,
    toggleFavoriteMeal,
    activeMealResult,
    setActiveMealResult,
    sendToVote,
    setActiveView,
    getMealPantryMatch,
    worldRecipes,
    rejectedMealIds,
    restoreRejected,
    shoppingList,
    shoppingOnline,
    householdMembers,
    meId,
    setMeId,
    addShoppingItems,
    toggleShoppingItem,
    removeShoppingItem,
    clearCheckedShopping,
  } = useDinner();

  const [recipeScope, setRecipeScope] = useState<'ours' | 'world'>('ours');
  const [worldCuisine, setWorldCuisine] = useState('all');
  const [sheetMeal, setSheetMeal] = useState<Meal | null>(null);
  const [newShopName, setNewShopName] = useState('');
  const toBuy = shoppingList.filter((i) => !i.checked);
  const gotIt = shoppingList.filter((i) => i.checked);
  const worldCuisines = Array.from(new Set(worldRecipes.map((r) => r.cuisine))).sort();

  const [activeTab, setActiveTab] = useState<Tab>(readInitialTab);

  // Scan / AI state
  const [analyzing, setAnalyzing] = useState<ScanType | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSuccess, setAnalysisSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentUploadType, setCurrentUploadType] = useState<ScanType>('snap-fridge');
  const [aiRecipePrompt, setAiRecipePrompt] = useState('');

  // Fridge
  const [newItemName, setNewItemName] = useState('');
  const [newItemFreshness, setNewItemFreshness] = useState<FreshnessLevel>('green');
  const [newStapleName, setNewStapleName] = useState('');
  const [newBannedName, setNewBannedName] = useState('');

  const [copiedShopping, setCopiedShopping] = useState(false);

  // Vault
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultFilter, setVaultFilter] = useState<'all' | 'favorites' | '5star' | '20m' | 'clearout'>('all');
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customCuisine, setCustomCuisine] = useState('British');
  const [customTime, setCustomTime] = useState<TimeStake>('30m');
  const [customEffort, setCustomEffort] = useState<EffortLevel>('one-pot');
  const [customIngredients, setCustomIngredients] = useState('');
  const [customSteps, setCustomSteps] = useState('');

  const flash = (msg: string) => {
    setAnalysisError(null);
    setAnalysisSuccess(msg);
  };

  const triggerCameraUpload = (type: ScanType) => {
    setCurrentUploadType(type);
    setAnalysisError(null);
    setAnalysisSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const processApiResult = (type: ScanType, data: any) => {
    const note = data.demoMode ? ' (sample data)' : '';
    if (type === 'snap-fridge' && data.detectedItems) {
      data.detectedItems.forEach((item: any) =>
        addPantryItem({
          name: item.name,
          category: item.category || 'Produce',
          freshness: ['green', 'amber', 'red'].includes(item.freshness) ? item.freshness : 'green',
          quantity: item.estimatedQuantity || '1',
        })
      );
      flash(`Added ${data.detectedItems.length} items to your fridge${note}.`);
      setActiveTab('fridge');
    } else if (type === 'scan-receipt' && data.items) {
      data.items.forEach((item: any) =>
        addPantryItem({
          name: item.name,
          category: item.category || 'Cupboard & Grains',
          freshness: 'green',
          quantity: item.quantity || '1',
        })
      );
      flash(`Added ${data.items.length} items from ${data.storeName || 'your receipt'}${note}.`);
      setActiveTab('fridge');
    } else if ((type === 'recipe-photo' || type === 'recipe-text') && data.meal) {
      addMeal({
        title: data.meal.title || 'New recipe',
        description: data.meal.description || '',
        cuisine: data.meal.cuisine || 'British',
        timeStake: data.meal.timeStake || '30m',
        effort: data.meal.effort || 'standard',
        ingredients: data.meal.ingredients || [],
        prepSteps: data.meal.prepSteps || [],
        tags: data.meal.tags || ['Scanned'],
      });
      flash(`Saved “${data.meal.title}” to your recipes${note}.`);
      setActiveTab('vault');
    } else {
      setAnalysisError('Nothing usable came back. Try a clearer photo.');
    }
  };

  const callAnalyze = async (type: ScanType, body: Record<string, unknown>) => {
    setAnalyzing(type);
    setAnalysisError(null);
    setAnalysisSuccess(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const res = await fetch('/api/pantry/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...body }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The scanner couldn’t read that.');
      processApiResult(type, data);
      if (type === 'recipe-text') setAiRecipePrompt('');
    } catch (err: any) {
      setAnalysisError(
        err?.name === 'AbortError'
          ? 'That took too long. Check your connection and try again.'
          : err?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      clearTimeout(timeout);
      setAnalyzing(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      callAnalyze(currentUploadType, { imageBase64: reader.result as string, mimeType: file.type || 'image/jpeg' });
    reader.onerror = () => setAnalysisError('Couldn’t read that image file.');
    reader.readAsDataURL(file);
  };

  const redCount = pantry.filter((p) => p.freshness === 'red').length;

  const filteredWorld = worldRecipes.filter((r) => {
    if (worldCuisine !== 'all' && r.cuisine !== worldCuisine) return false;
    if (rejectedMealIds.includes(r.id)) return false;
    const q = vaultSearch.trim().toLowerCase();
    return (
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.cuisine.toLowerCase().includes(q) ||
      (r.origin || '').toLowerCase().includes(q) ||
      r.ingredients.some((i) => i.toLowerCase().includes(q))
    );
  });

  const filteredVaultMeals = meals.filter((meal) => {
    const q = vaultSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      meal.title.toLowerCase().includes(q) ||
      meal.cuisine.toLowerCase().includes(q) ||
      meal.ingredients.some((i) => i.toLowerCase().includes(q));
    if (!matchesSearch) return false;
    if (vaultFilter === 'favorites') return meal.isFavorite;
    if (vaultFilter === '5star') return meal.rating === 5;
    if (vaultFilter === '20m') return meal.timeStake === '20m';
    if (vaultFilter === 'clearout') return getMealPantryMatch(meal).redMatchedItems.length > 0;
    return true;
  });

  const handleSaveManualRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    const ingList = customIngredients.split(',').map((s) => s.trim()).filter(Boolean);
    const stepList = customSteps.split('\n').map((s) => s.trim()).filter(Boolean);
    addMeal({
      title: customTitle.trim(),
      description: customDesc.trim() || `A ${customCuisine} favourite, ready in ${timeLabel(customTime).toLowerCase()}.`,
      cuisine: customCuisine,
      timeStake: customTime,
      effort: customEffort,
      ingredients: ingList,
      prepSteps:
        stepList.length > 0
          ? stepList
          : ['Prep and chop everything (-20m)', 'Cook the main (-12m)', 'Finish the sauce and season (-4m)', 'Serve (-0m)'],
      tags: ['Family recipe', customCuisine],
      source: 'own',
    });
    flash(`Saved “${customTitle.trim()}” to your recipes.`);
    setCustomTitle('');
    setCustomDesc('');
    setCustomIngredients('');
    setCustomSteps('');
    setShowAddRecipe(false);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'fridge', label: 'Fridge', count: pantry.length },
    { id: 'vault', label: 'Recipes', count: meals.length },
    { id: 'missing', label: 'Shopping', count: toBuy.length || undefined },
    { id: 'camera', label: 'Scan' },
    { id: 'staples', label: 'Staples' },
    { id: 'banned', label: 'Avoid' },
  ];

  // A plain render helper (not a component) so rows keep focus across re-renders.
  const renderFreshnessGroup = (level: FreshnessLevel, title: string) => {
    const items = pantry.filter((p) => p.freshness === level);
    if (items.length === 0) return null;
    return (
      <section aria-label={title}>
        <h3 className="mb-1.5 flex items-center gap-2 px-1 text-[13px] font-semibold text-ink-2">
          <FreshDot level={level} /> {title}
          <span className="font-normal text-ink-3 tabular-nums">{items.length}</span>
        </h3>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
              <div className="min-w-0 flex-1 py-1.5">
                <p className="truncate text-[15px]">{item.name}</p>
                <p className="truncate text-[12px] text-ink-3">
                  {item.category}
                  {item.quantity ? ` · ${item.quantity}` : ''}
                </p>
              </div>
              <button
                onClick={() => togglePantryFreshness(item.id)}
                aria-label={`${item.name}: ${freshnessLabel(item.freshness)}. Tap to change`}
                title="Tap to change: Fresh → Eat soon → Use next"
                className={cx(
                  'h-9 shrink-0 rounded-lg px-2.5 text-[12px] font-semibold',
                  item.freshness === 'red' && 'bg-tomato-soft text-tomato',
                  item.freshness === 'amber' && 'bg-saffron-soft text-saffron',
                  item.freshness === 'green' && 'bg-sage-soft text-sage'
                )}
              >
                {freshnessLabel(item.freshness)}
              </button>
              <IconButton label={`Remove ${item.name}`} onClick={() => removePantryItem(item.id)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const scanRows: { type: ScanType; icon: React.ReactNode; title: string; body: string }[] = [
    { type: 'snap-fridge', icon: <Camera className="h-5 w-5" />, title: 'Photo of the fridge', body: 'Adds what it sees, with a freshness guess.' },
    { type: 'scan-receipt', icon: <Receipt className="h-5 w-5" />, title: 'Supermarket receipt', body: 'Adds the food lines from your shop.' },
    { type: 'recipe-photo', icon: <BookOpen className="h-5 w-5" />, title: 'Recipe page or plate', body: 'Turns it into a recipe with a timeline.' },
  ];

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold">Pantry</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          {redCount > 0
            ? `${redCount} ${redCount === 1 ? 'thing needs' : 'things need'} using up. The spinner can favour them.`
            : 'What you have, what you cook, and what you need.'}
        </p>
      </div>

      <div role="tablist" aria-label="Pantry sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                'h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                selected ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-sunk hover:text-ink'
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={cx('ml-1.5 font-normal tabular-nums', selected ? 'opacity-70' : 'text-ink-3')}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {analysisSuccess && (
        <Notice tone="sage" icon={<CircleCheck className="h-4 w-4" />} onDismiss={() => setAnalysisSuccess(null)}>
          {analysisSuccess}
        </Notice>
      )}
      {analysisError && (
        <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />} onDismiss={() => setAnalysisError(null)}>
          {analysisError}
        </Notice>
      )}

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="space-y-4">
        {/* FRIDGE */}
        {activeTab === 'fridge' && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newItemName.trim()) return;
                addPantryItem({ name: newItemName.trim(), category: 'Fridge', freshness: newItemFreshness, quantity: '' });
                setNewItemName('');
              }}
            >
              <TextInput
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Add an item"
                aria-label="New fridge item"
              />
              <Select
                value={newItemFreshness}
                onChange={(e) => setNewItemFreshness(e.target.value as FreshnessLevel)}
                aria-label="Freshness"
                className="w-[118px] shrink-0"
              >
                <option value="green">Fresh</option>
                <option value="amber">Eat soon</option>
                <option value="red">Use next</option>
              </Select>
              <Button type="submit" variant="primary" disabled={!newItemName.trim()} aria-label="Add item" className="!px-3">
                <Plus className="h-5 w-5" />
              </Button>
            </form>
            {pantry.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="font-display text-[19px] font-semibold">The fridge is empty</p>
                <p className="mt-1 text-[14px] text-ink-2">Add items above, or scan a receipt to fill it in one go.</p>
                <Button variant="secondary" className="mt-4" onClick={() => setActiveTab('camera')}>
                  <Receipt className="h-4 w-4" /> Scan a receipt
                </Button>
              </Card>
            ) : (
              <>
                {renderFreshnessGroup('red', 'Use next')}
                {renderFreshnessGroup('amber', 'Eat soon')}
                {renderFreshnessGroup('green', 'Fresh')}
              </>
            )}
          </>
        )}

        {/* RECIPES */}
        {activeTab === 'vault' && (
          <>
            <Segmented<'ours' | 'world'>
              label="Recipe collection"
              value={recipeScope}
              onChange={setRecipeScope}
              options={[
                { value: 'ours', label: `Our recipes · ${meals.length}` },
                { value: 'world', label: `World kitchen · ${worldRecipes.length}` },
              ]}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <TextInput
                type="search"
                value={vaultSearch}
                onChange={(e) => setVaultSearch(e.target.value)}
                placeholder={recipeScope === 'world' ? 'Search 46 cuisines' : 'Search dishes or ingredients'}
                aria-label="Search recipes"
                className="pl-10"
              />
            </div>

            {recipeScope === 'ours' ? (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none" role="radiogroup" aria-label="Filter recipes">
                {(
                  [
                    ['all', 'All'],
                    ['favorites', 'Favourites'],
                    ['5star', 'Five-star'],
                    ['20m', '20 min'],
                    ['clearout', 'Uses up fridge'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={vaultFilter === id}
                    onClick={() => setVaultFilter(id)}
                    className={cx(
                      'h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors',
                      vaultFilter === id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:border-line-strong'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <Select value={worldCuisine} onChange={(e) => setWorldCuisine(e.target.value)} aria-label="Cuisine" className="w-full">
                <option value="all">Every cuisine</option>
                {worldCuisines.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}

            {(recipeScope === 'ours' ? filteredVaultMeals : filteredWorld).length === 0 ? (
              <p className="py-8 text-center text-[14px] text-ink-2">Nothing matches. Try another search.</p>
            ) : (
              <ul className="space-y-2">
                {(recipeScope === 'ours' ? filteredVaultMeals : filteredWorld).map((meal) => {
                  const match = getMealPantryMatch(meal);
                  const added = recipeScope === 'world' && meals.some((m) => m.id === meal.id);
                  return (
                    <li key={meal.id}>
                      <button
                        onClick={() => setSheetMeal(meal)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-2.5 text-left transition-colors hover:border-line-strong"
                      >
                        <DishTile cuisine={meal.cuisine} imageUrl={meal.imageUrl || photoFor(meal.id)} size={56} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[16px] leading-snug font-semibold">{meal.title}</span>
                          <span className="mt-0.5 block text-[12px] text-ink-2">
                            {recipeScope === 'world' ? `${meal.origin} · ` : ''}
                            {timeLabel(meal.timeStake)} · have {match.matchedCount}/{match.totalCount}
                            {meal.rating === 5 && ' · ★ five-star'}
                            {meal.tweaks && (meal.tweaks.extraIngredients.length + meal.tweaks.extraSteps.length > 0) && ' · tweaked'}
                          </span>
                          {recipeScope === 'ours' && match.redMatchedItems.length > 0 && (
                            <Chip tone="tomato" className="mt-1">
                              Uses up {match.redMatchedItems.join(', ')}
                            </Chip>
                          )}
                        </span>
                        {added && <Chip tone="sage">Added</Chip>}
                        {recipeScope === 'ours' && meal.isFavorite && <Heart className="h-4 w-4 shrink-0 fill-tomato text-tomato" aria-label="Favourite" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {recipeScope === 'ours' && (
              <div className="space-y-3 border-t border-line pt-3">
                <button
                  onClick={() => setShowAddRecipe((v) => !v)}
                  aria-expanded={showAddRecipe}
                  className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink"
                >
                  <Plus className="h-4 w-4" /> {showAddRecipe ? 'Cancel' : 'Add your own recipe'}
                </button>
                {showAddRecipe && (
                  <form onSubmit={handleSaveManualRecipe} className="fade-up space-y-2">
                    <TextInput value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Dish name" aria-label="Dish name" required />
                    <TextInput value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="One line about it (optional)" aria-label="Description" />
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={customCuisine} onChange={(e) => setCustomCuisine(e.target.value)} aria-label="Cuisine">
                        {['British', 'Italian', 'Indian', 'Mexican', 'Chinese', 'Thai', 'Greek', 'French', 'Japanese', 'Other'].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                      <Select value={customTime} onChange={(e) => setCustomTime(e.target.value as TimeStake)} aria-label="Time">
                        <option value="20m">20 min</option>
                        <option value="30m">30 min</option>
                        <option value="60m">1 hour</option>
                        <option value="all-day">All day</option>
                      </Select>
                      <Select value={customEffort} onChange={(e) => setCustomEffort(e.target.value as EffortLevel)} aria-label="Effort">
                        <option value="one-pot">One pot</option>
                        <option value="standard">Standard</option>
                        <option value="chef-mode">Chef mode</option>
                      </Select>
                    </div>
                    <TextInput
                      value={customIngredients}
                      onChange={(e) => setCustomIngredients(e.target.value)}
                      placeholder="Ingredients, separated by commas"
                      aria-label="Ingredients"
                    />
                    <textarea
                      value={customSteps}
                      onChange={(e) => setCustomSteps(e.target.value)}
                      rows={3}
                      placeholder={'Steps, one per line. Add timing like (-15m)'}
                      aria-label="Steps"
                      className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
                    />
                    <Button type="submit" variant="primary" block disabled={!customTitle.trim()}>
                      Save recipe
                    </Button>
                  </form>
                )}

                {rejectedMealIds.length > 0 && (
                  <details className="text-[14px]">
                    <summary className="cursor-pointer font-semibold text-ink-2">
                      Hidden dishes ({rejectedMealIds.length})
                    </summary>
                    <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card">
                      {rejectedMealIds.map((id) => {
                        const dish = worldRecipes.find((r) => r.id === id) || INITIAL_MEALS.find((m) => m.id === id);
                        return (
                          <li key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="truncate">{dish?.title || id}</span>
                            <Button variant="quiet" size="sm" onClick={() => restoreRejected(id)}>
                              Bring back
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </>
        )}

        {/* SHOPPING */}
        {activeTab === 'missing' && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-sunk px-3 py-2.5 text-[13px]">
              <span className="flex items-center gap-2 text-ink-2">
                <span
                  className={cx(
                    'h-2 w-2 shrink-0 rounded-full',
                    shoppingOnline ? 'bg-sage' : shoppingOnline === false ? 'bg-saffron' : 'bg-line-strong'
                  )}
                />
                {shoppingOnline
                  ? 'Shared with everyone in the household'
                  : shoppingOnline === false
                  ? 'Offline. Changes sync when you’re back'
                  : 'Connecting…'}
              </span>
              <label className="flex shrink-0 items-center gap-1.5">
                <span className="text-ink-2">I’m</span>
                <select
                  value={meId}
                  onChange={(e) => setMeId(e.target.value)}
                  aria-label="Who is using this phone"
                  className="rounded-lg border border-line bg-card px-2 py-1 text-[13px] font-semibold"
                >
                  <option value="">Choose…</option>
                  {householdMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newShopName.trim()) return;
                addShoppingItems([newShopName.trim()]);
                setNewShopName('');
              }}
            >
              <TextInput value={newShopName} onChange={(e) => setNewShopName(e.target.value)} placeholder="Add to the list" aria-label="Add to the shopping list" />
              <Button type="submit" variant="primary" disabled={!newShopName.trim()} aria-label="Add" className="!px-3">
                <Plus className="h-5 w-5" />
              </Button>
            </form>

            {shoppingList.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="font-display text-[19px] font-semibold">The list is empty</p>
                <p className="mt-1 text-[14px] text-ink-2">
                  Open a recipe and tick what you have. Whatever’s left lands here for whoever does the shop.
                </p>
                <Button variant="secondary" className="mt-4" onClick={() => setActiveTab('vault')}>
                  Pick a recipe
                </Button>
              </Card>
            ) : (
              <>
                {[
                  { title: 'To buy', items: toBuy },
                  { title: 'In the basket', items: gotIt },
                ].map(
                  (group) =>
                    group.items.length > 0 && (
                      <section key={group.title} aria-label={group.title}>
                        <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">
                          {group.title} <span className="font-normal text-ink-3 tabular-nums">{group.items.length}</span>
                        </h3>
                        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                          {group.items.map((item) => (
                            <li key={item.id} className="flex items-center gap-1 pr-1">
                              <button
                                role="checkbox"
                                aria-checked={item.checked}
                                onClick={() => toggleShoppingItem(item.id)}
                                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                              >
                                <span
                                  className={cx(
                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                    item.checked ? 'border-sage bg-sage text-white' : 'border-line-strong'
                                  )}
                                >
                                  {item.checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                                </span>
                                <span className="min-w-0">
                                  <span className={cx('block truncate text-[15px]', item.checked && 'text-ink-3 line-through')}>
                                    {item.name}
                                  </span>
                                  <span className="block truncate text-[12px] text-ink-3">
                                    {item.checked
                                      ? `Got it${item.checkedBy ? ` · ${item.checkedBy}` : ''}`
                                      : [item.forMeal && `for ${item.forMeal}`, item.addedBy && `added by ${item.addedBy}`]
                                          .filter(Boolean)
                                          .join(' · ')}
                                  </span>
                                </span>
                              </button>
                              <IconButton label={`Remove ${item.name}`} onClick={() => removeShoppingItem(item.id)}>
                                <X className="h-4 w-4" />
                              </IconButton>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const text = `Shopping list:\n${toBuy.map((i) => `- ${i.name}`).join('\n') || 'All done!'}`;
                      try {
                        await navigator.clipboard.writeText(text);
                        setCopiedShopping(true);
                        setTimeout(() => setCopiedShopping(false), 2000);
                      } catch {
                        setAnalysisError('Couldn’t copy to the clipboard on this device.');
                      }
                    }}
                  >
                    {copiedShopping ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
                    {copiedShopping ? 'Copied' : 'Copy list'}
                  </Button>
                  <Button
                    variant="success"
                    disabled={gotIt.length === 0}
                    onClick={() => {
                      gotIt.forEach((i) => addPantryItem({ name: i.name, category: 'Shopping', freshness: 'green', quantity: '' }));
                      clearCheckedShopping();
                      flash(`Put ${gotIt.length} ${gotIt.length === 1 ? 'item' : 'items'} away in the fridge.`);
                    }}
                  >
                    <ShoppingBasket className="h-4 w-4" /> Put away
                  </Button>
                </div>
                <p className="text-center text-[12px] text-ink-3">
                  “Put away” moves ticked items into the fridge and clears them from the list.
                </p>
              </>
            )}
          </>
        )}

        {/* SCAN */}
        {activeTab === 'camera' && (
          <>
            <ul className="space-y-2">
              {scanRows.map((row) => (
                <li key={row.type}>
                  <Card as="div" className="flex items-center gap-3 p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-ink-2">
                      {analyzing === row.type ? <LoaderCircle className="h-5 w-5 animate-spin" /> : row.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{row.title}</p>
                      <p className="text-[12px] text-ink-2">{row.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button size="sm" variant="secondary" disabled={!!analyzing} onClick={() => triggerCameraUpload(row.type)}>
                        Upload
                      </Button>
                      {row.type !== 'recipe-photo' && (
                        <button
                          disabled={!!analyzing}
                          onClick={() => callAnalyze(row.type, { textPrompt: 'Sample', demo: true })}
                          className="text-[12px] font-semibold text-ink-3 hover:text-ink disabled:opacity-50"
                        >
                          Try a sample
                        </button>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!aiRecipePrompt.trim()) return;
                callAnalyze('recipe-text', { textPrompt: aiRecipePrompt.trim() });
              }}
            >
              <label htmlFor="describe-dish" className="block text-[15px] font-semibold">
                Or describe a dish
              </label>
              <div className="flex gap-2">
                <TextInput
                  id="describe-dish"
                  value={aiRecipePrompt}
                  onChange={(e) => setAiRecipePrompt(e.target.value)}
                  placeholder="e.g. Lamb kofta flatbreads"
                />
                <Button type="submit" variant="primary" disabled={!!analyzing || !aiRecipePrompt.trim()}>
                  {analyzing === 'recipe-text' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Create
                </Button>
              </div>
            </form>
            {analyzing && (
              <p className="text-[13px] text-ink-2" role="status">
                Reading it now. This can take up to 20 seconds.
              </p>
            )}
          </>
        )}

        {/* STAPLES */}
        {activeTab === 'staples' && (
          <Card className="space-y-3 p-4">
            <p className="text-[14px] text-ink-2">Things you always have. They count as in stock for every recipe.</p>
            <ul className="flex flex-wrap gap-1.5">
              {staples.map((staple) => (
                <li key={staple} className="inline-flex items-center gap-1 rounded-full bg-sunk py-1 pr-1 pl-3 text-[13px]">
                  {staple}
                  <button onClick={() => removeStaple(staple)} aria-label={`Remove ${staple}`} className="rounded-full p-1 text-ink-3 hover:text-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className={CHIP_LIST_INPUT}
              onSubmit={(e) => {
                e.preventDefault();
                addStaple(newStapleName);
                setNewStapleName('');
              }}
            >
              <TextInput value={newStapleName} onChange={(e) => setNewStapleName(e.target.value)} placeholder="e.g. Soy sauce" aria-label="New staple" />
              <Button type="submit" variant="secondary" disabled={!newStapleName.trim()}>
                Add
              </Button>
            </form>
          </Card>
        )}

        {/* AVOID */}
        {activeTab === 'banned' && (
          <Card className="space-y-3 p-4">
            <p className="text-[14px] text-ink-2">The spinner will never land on a dish containing these.</p>
            {bannedIngredients.length === 0 ? (
              <p className="text-[14px] text-ink-3">Nothing on the list.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {bannedIngredients.map((ing) => (
                  <li key={ing} className="inline-flex items-center gap-1 rounded-full bg-tomato-soft py-1 pr-1 pl-3 text-[13px] text-tomato">
                    {ing}
                    <button onClick={() => toggleBannedIngredient(ing)} aria-label={`Allow ${ing} again`} className="rounded-full p-1 opacity-70 hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className={CHIP_LIST_INPUT}
              onSubmit={(e) => {
                e.preventDefault();
                if (!newBannedName.trim()) return;
                toggleBannedIngredient(newBannedName.trim());
                setNewBannedName('');
              }}
            >
              <TextInput value={newBannedName} onChange={(e) => setNewBannedName(e.target.value)} placeholder="e.g. Olives" aria-label="Ingredient to avoid" />
              <Button type="submit" variant="secondary" disabled={!newBannedName.trim()}>
                Avoid
              </Button>
            </form>
          </Card>
        )}
      </div>
      {sheetMeal && (
        <RecipeSheet
          meal={sheetMeal}
          onClose={() => setSheetMeal(null)}
          onReplaced={(gone, replacement) =>
            flash(
              replacement
                ? `“${gone.title}” is hidden for good. “${replacement.title}” has taken its place.`
                : `“${gone.title}” is hidden for good.`
            )
          }
        />
      )}
    </div>
  );
};
