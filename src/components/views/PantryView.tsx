import React, { useRef, useState } from 'react';
import { useDinner } from '../../context/DinnerContext';
import { DietPicker } from '../DietPicker';
import { MemberPrefs } from '../MemberPrefs';
import { useByLabel, useByStatus } from '../../utils/leftovers';
import { ImportRecipe } from '../ImportRecipe';
import { DeliverySheet } from '../DeliverySheet';
import type { ImportedRecipe } from '../../utils/recipeImport';
import { mealFitsDiets } from '../../utils/diets';
import { lovedCount } from '../../utils/taste';
import { POPULAR_CUISINES } from '../../data/popularCuisines';
import { CuisineFlag } from '../CuisineFlag';
import { STORES, StoreId } from '../../utils/planner';
import { inFreezer, usedUp, totalPortions, oldestFirst, frozenAgo, isEatSoon } from '../../utils/freezer';
import {
  Camera,
  Receipt,
  BookOpen,
  Plus,
  Trash2,
  CircleCheck,
  CircleAlert,
  ShoppingBasket,
  Bike,
  Check,
  Star,
  X,
  Heart,
  Search,
  Send,
  Dices,
  Sparkles,
  Copy,
  Snowflake,
  Minus,
  Undo2,
  LoaderCircle,
  ExternalLink,
  ChevronLeft,
} from 'lucide-react';
import { FreshnessLevel, Meal, TimeStake, EffortLevel } from '../../types';
import { RecipeSheet } from '../RecipeSheet';
import { PageHeader } from '../ui';
import { itemIcon } from '../../utils/itemIcon';
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

type Tab = 'fridge' | 'freezer' | 'vault' | 'missing' | 'camera' | 'staples' | 'banned';
type ScanType = 'snap-fridge' | 'scan-receipt' | 'recipe-photo' | 'recipe-text';

export type PantryScope = 'fridge' | 'recipes' | 'shop';

const initialTabFor = (scope: PantryScope): Tab => {
  if (scope === 'recipes') return 'vault';
  if (scope === 'shop') return 'missing';
  // The Dinner screen's freezer card asks for the Freezer tab once.
  try {
    if (sessionStorage.getItem('ds_pantry_tab') === 'freezer') {
      sessionStorage.removeItem('ds_pantry_tab');
      return 'freezer';
    }
  } catch {
    // ignore
  }
  return 'fridge';
};

const CHIP_LIST_INPUT = 'flex gap-2 border-t border-line pt-3';

export const PantryView: React.FC<{ scope: PantryScope }> = ({ scope }) => {
  const {
    pantry,
    togglePantryFreshness,
    addPantryItem,
    removePantryItem,
    staples,
    addStaple,
    removeStaple,
    bannedIngredients,
    diets,
    toggleDiet,
    toggleBannedIngredient,
    likedIngredients,
    addLikedIngredient,
    removeLikedIngredient,
    shelvedMeals,
    meals,
    addMeal,
    deleteMeal,
    toggleFavoriteMeal,
    activeMealResult,
    setActiveMealResult,
    mode,
    proposedMeal,
    agreedMeal,
    sendToVote,
    setActiveView,
    authHeaders,
    getMealPantryMatch,
    worldRecipes,
    rejectedMealIds,
    restoreRejected,
    rejectMeal,
    hideLibraryRecipe,
    shoppingList,
    shoppingOnline,
    householdMembers,
    meId,
    setMeId,
    addShoppingItems,
    toggleShoppingItem,
    removeShoppingItem,
    clearCheckedShopping,
    freezer,
    addFreezerItem,
    useFreezerPortion,
    putBackFreezerPortion,
    removeFreezerItem,
    clearUsedFreezer,
    store,
    setStore,
  } = useDinner();
  const storeInfo = STORES.find((x) => x.id === store) || STORES[0];

  const [recipeScope, setRecipeScope] = useState<'ours' | 'world'>(() => {
    try {
      const v = sessionStorage.getItem('ds_pantry_scope');
      sessionStorage.removeItem('ds_pantry_scope');
      return v === 'world' ? 'world' : 'ours';
    } catch {
      return 'ours';
    }
  });
  const [worldCuisine, setWorldCuisine] = useState('all');
  const [analyzeTry, setAnalyzeTry] = useState(1);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sheetMeal, setSheetMeal] = useState<Meal | null>(null);
  const [newShopName, setNewShopName] = useState('');
  const [freezeName, setFreezeName] = useState('');
  const [freezePortions, setFreezePortions] = useState(4);
  const stocked = oldestFirst(inFreezer(freezer));
  const finished = usedUp(freezer);
  const freezerPortions = totalPortions(freezer);
  const toBuy = shoppingList.filter((i) => !i.checked);
  const gotIt = shoppingList.filter((i) => i.checked);
  const worldCuisines = Array.from(new Set(worldRecipes.map((r) => r.cuisine))).sort();

  const [activeTab, setActiveTab] = useState<Tab>(() => initialTabFor(scope));

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
  const [newLovedName, setNewLovedName] = useState('');

  const [copiedShopping, setCopiedShopping] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

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

  const addFormRef = useRef<HTMLDivElement | null>(null);

  /** Fills the add-a-recipe form with something imported, so it can be checked and edited before saving. */
  const applyDraft = (r: ImportedRecipe, note: string) => {
    setCustomTitle(r.title);
    setCustomDesc(r.description);
    setCustomCuisine(r.cuisine || 'Other');
    setCustomTime(r.timeStake);
    setCustomEffort(r.effort);
    setCustomIngredients(r.ingredients.join('\n'));
    setCustomSteps(r.prepSteps.join('\n'));
    setShowAddRecipe(true);
    flash(note);
    requestAnimationFrame(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

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
      applyDraft(
        {
          title: data.meal.title || 'New recipe',
          description: data.meal.description || '',
          cuisine: data.meal.cuisine || 'Other',
          timeStake: data.meal.timeStake || '30m',
          effort: data.meal.effort || 'standard',
          ingredients: data.meal.ingredients || [],
          prepSteps: data.meal.prepSteps || [],
          tags: data.meal.tags || ['Scanned'],
        },
        `Drafted “${data.meal.title}”${note}. Check it over, then save.`
      );
      setActiveTab('vault');
    } else {
      setAnalysisError('Nothing usable came back. Try a clearer photo.');
    }
  };

  const callAnalyze = async (type: ScanType, body: Record<string, unknown>) => {
    setAnalyzing(type);
    setAnalysisError(null);
    setAnalysisSuccess(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // The reader is sometimes swamped. If so, wait a few seconds and ask again, up to three goes in all.
      let res!: Response;
      let data: any = {};
      for (let n = 1; n <= 3; n++) {
        setAnalyzeTry(n);
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 40000);
        res = await fetch('/api/pantry/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ type, ...body }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        data = await res.json().catch(() => ({}));
        if (!(res.status === 503 && data.busy) || n === 3) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? 'Start a family group first, because the scanner and recipe writer are for groups. You can still add a recipe by hand or from a web link.'
            : res.status === 413
              ? 'That photo is too big to send. Try a smaller one.'
              : data.error || 'The scanner couldn’t read that.'
        );
      }
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
      setAnalyzeTry(1);
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
    if (worldCuisine === 'other') {
      if (POPULAR_CUISINES.some((c) => c.id === r.cuisine)) return false;
    } else if (worldCuisine !== 'all' && r.cuisine !== worldCuisine) return false;
    if (rejectedMealIds.includes(r.id)) return false;
    if (!mealFitsDiets(r.ingredients, diets)) return false;
    const q = vaultSearch.trim().toLowerCase();
    return (
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.cuisine.toLowerCase().includes(q) ||
      (r.origin || '').toLowerCase().includes(q) ||
      r.ingredients.some((i) => i.toLowerCase().includes(q))
    );
  });

  // The World Kitchen opens on a short list of picks (varied cuisines, loved ingredients first). Remove one, or add it
  // to our recipes, and the next dish takes its place. Searching or choosing a cuisine looks through the whole library.
  const WORLD_PICKS = 30;
  const inOurs = new Set(meals.map((m) => m.id));
  const worldAvailable = worldRecipes.filter((r) => !rejectedMealIds.includes(r.id) && !inOurs.has(r.id) && mealFitsDiets(r.ingredients, diets));
  const browsingPicks = recipeScope === 'world' && worldCuisine === 'all' && !vaultSearch.trim();
  const worldPicks = (() => {
    const ranked = [...worldAvailable].sort((a, b) => lovedCount(b, likedIngredients) - lovedCount(a, likedIngredients));
    const byCuisine = new Map<string, Meal[]>();
    for (const r of ranked) byCuisine.set(r.cuisine, [...(byCuisine.get(r.cuisine) || []), r]);
    const lanes = [...byCuisine.values()];
    const out: Meal[] = [];
    for (let i = 0; out.length < WORLD_PICKS && lanes.some((l) => l.length > i); i++) {
      for (const lane of lanes) if (lane[i] && out.length < WORLD_PICKS) out.push(lane[i]);
    }
    return out;
  })();

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
    const ingList = customIngredients.split(/\n|,(?!\s*\d)/).map((s) => s.trim()).filter(Boolean);
    const stepList = customSteps.split('\n').map((s) => s.trim()).filter(Boolean);
    const saved = addMeal({
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
    // A new recipe goes straight onto the spinner (unless tonight's dinner is already being voted on or cooked).
    const onSpinner = mode === 'single' && !proposedMeal && !agreedMeal && mealFitsDiets(saved.ingredients, diets);
    if (onSpinner) setActiveMealResult(saved);
    flash(onSpinner ? `Saved “${customTitle.trim()}” to your recipes. It's on the spinner now.` : `Saved “${customTitle.trim()}” to your recipes. It's in the spinner's mix.`);
    setCustomTitle('');
    setCustomDesc('');
    setCustomIngredients('');
    setCustomSteps('');
    setShowAddRecipe(false);
  };

  const tabs: { id: Tab; label: string; count?: number }[] =
    scope === 'fridge'
      ? [
          { id: 'fridge', label: 'In the fridge', count: pantry.length },
          { id: 'freezer', label: 'Freezer', count: freezerPortions || undefined },
          { id: 'camera', label: 'Add by photo' },
          { id: 'staples', label: 'Always have' },
          { id: 'banned', label: 'Likes and dislikes' },
        ]
      : [];

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
                {useByLabel(item.useBy) && (
                  <p
                    className={cx(
                      'truncate text-[12px] font-medium',
                      (useByStatus(item.useBy) === 'over' || useByStatus(item.useBy) === 'today') && 'text-tomato',
                      useByStatus(item.useBy) === 'soon' && 'text-saffron',
                      useByStatus(item.useBy) === 'ok' && 'text-ink-3'
                    )}
                  >
                    {useByLabel(item.useBy)}
                  </p>
                )}
              </div>
              <button
                onClick={() => togglePantryFreshness(item.id)}
                aria-label={`${item.name}: ${freshnessLabel(item.freshness)}. Tap to change`}
                title="Tap to change: Fresh → Eat soon → Use next"
                className={cx(
                  'h-10 shrink-0 rounded-lg px-2.5 text-[12px] font-semibold',
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

  const allScanRows: { type: ScanType; icon: React.ReactNode; title: string; body: string }[] = [
    { type: 'snap-fridge', icon: <Camera className="h-5 w-5" />, title: 'Photo of the fridge', body: 'Adds what it sees, with a freshness guess.' },
    { type: 'scan-receipt', icon: <Receipt className="h-5 w-5" />, title: 'Supermarket receipt', body: 'Adds the food lines from your shop.' },
    { type: 'recipe-photo', icon: <BookOpen className="h-5 w-5" />, title: 'Recipe page or plate', body: 'Turns it into a recipe with a timeline.' },
  ];
  // Recipe photos now live in the "Add a recipe" panel with the other ways in.
  const scanRows = allScanRows.filter((r) => scope !== 'recipes' && r.type !== 'recipe-photo');

  const renderScan = () => (
    <div className="space-y-4">
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

            {analyzing && (
              <p className="rounded-xl bg-saffron-soft px-3 py-2.5 text-[13px] text-ink" role="status">
                <span className="font-semibold">Working on it. Please wait, this can take up to a minute.</span>{' '}
                {analyzeTry > 1 ? `The reader is busy, so we're trying again (go ${analyzeTry} of 3). ` : ''}Keep this screen open until it finishes.
              </p>
            )}
    </div>
  );

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

      {scope === 'fridge' && (
        <PageHeader
          title="Fridge"
          subtitle={
            redCount > 0
              ? `${redCount} ${redCount === 1 ? 'thing needs' : 'things need'} using up. Turn on “use up first” on the Dinner tab and the spinner favours them.`
              : 'Tell the app what you have and it picks dinners that use it.'
          }
        />
      )}
      {scope === 'shop' && (
        <PageHeader
          title="Shopping"
          subtitle="One list for the whole household. Open a recipe and tick what you have; the rest lands here."
        />
      )}
      {scope === 'recipes' && (
        <PageHeader
          title="Recipes"
          subtitle="Your dishes and 119 world classics. Tap one for the method, then add it to your rotation."
          action={
            <Button variant={showAddRecipe ? 'secondary' : 'primary'} size="sm" onClick={() => setShowAddRecipe((v) => !v)} aria-expanded={showAddRecipe}>
              {showAddRecipe ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showAddRecipe ? 'Close' : 'Add recipe'}
            </Button>
          }
        />
      )}

      {tabs.length > 0 && (
        <div role="tablist" aria-label="Fridge sections" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none">
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
                  'h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors',
                  selected ? 'bg-ink text-paper' : 'bg-sunk text-ink-2 hover:text-ink'
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
      )}

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

        {/* FREEZER */}
        {activeTab === 'freezer' && (
          <>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!freezeName.trim()) return;
                const match = meals.find((m) => m.title.toLowerCase() === freezeName.trim().toLowerCase());
                addFreezerItem({ name: freezeName, portions: freezePortions, mealId: match?.id });
                setFreezeName('');
              }}
            >
              <TextInput
                value={freezeName}
                onChange={(e) => setFreezeName(e.target.value)}
                placeholder="What did you batch cook?"
                aria-label="Batch-cooked meal to freeze"
                list="freezer-dish-suggestions"
              />
              <datalist id="freezer-dish-suggestions">
                {meals.map((m) => (
                  <option key={m.id} value={m.title} />
                ))}
              </datalist>
              <div className="flex items-center gap-2">
                <div className="flex h-11 items-center rounded-xl border border-line bg-card" role="group" aria-label="Portions">
                  <button
                    type="button"
                    onClick={() => setFreezePortions((n) => Math.max(1, n - 1))}
                    aria-label="Fewer portions"
                    className="flex h-11 w-11 items-center justify-center text-ink-2 hover:text-ink"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[5.5rem] text-center text-[15px] tabular-nums" aria-live="polite">
                    {freezePortions} {freezePortions === 1 ? 'portion' : 'portions'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFreezePortions((n) => Math.min(99, n + 1))}
                    aria-label="More portions"
                    className="flex h-11 w-11 items-center justify-center text-ink-2 hover:text-ink"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <Button type="submit" variant="primary" disabled={!freezeName.trim()} className="flex-1">
                  <Snowflake className="h-4 w-4" /> Put in freezer
                </Button>
              </div>
            </form>

            {stocked.length === 0 && finished.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="font-display text-[19px] font-semibold">The freezer list is empty</p>
                <p className="mt-1 text-[14px] text-ink-2">
                  After a batch cook, add it here with how many portions you froze. Tick one off each time you eat it.
                </p>
              </Card>
            ) : (
              <>
                {stocked.length > 0 && (
                  <section aria-label="In the freezer">
                    <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">
                      In the freezer{' '}
                      <span className="font-normal text-ink-3 tabular-nums">
                        {stocked.length} {stocked.length === 1 ? 'meal' : 'meals'} · {freezerPortions}{' '}
                        {freezerPortions === 1 ? 'portion' : 'portions'}
                      </span>
                    </h3>
                    <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                      {stocked.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                          <div className="min-w-0 flex-1 py-1.5">
                            <p className="truncate text-[15px]">{item.name}</p>
                            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                              <span>{frozenAgo(item)}</span>
                              {isEatSoon(item) && <Chip tone="saffron">Eat soon</Chip>}
                            </p>
                          </div>
                          <span
                            className="shrink-0 text-[13px] text-ink-2 tabular-nums"
                            aria-label={`${item.portions} of ${item.totalPortions} portions left`}
                          >
                            {item.portions}/{item.totalPortions}
                          </span>
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => useFreezerPortion(item.id)}
                            aria-label={`Tick off one portion of ${item.name}`}
                          >
                            <Check className="h-4 w-4" strokeWidth={3} /> Ate one
                          </Button>
                          <IconButton label={`Remove ${item.name} from the freezer`} onClick={() => removeFreezerItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {finished.length > 0 && (
                  <details className="text-[14px]">
                    <summary className="cursor-pointer font-semibold text-ink-2">Finished ({finished.length})</summary>
                    <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card">
                      {finished.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
                          <span className="min-w-0 truncate text-ink-3 line-through">{item.name}</span>
                          <Button
                            variant="quiet"
                            size="sm"
                            onClick={() => putBackFreezerPortion(item.id)}
                            aria-label={`Put one portion of ${item.name} back`}
                          >
                            <Undo2 className="h-4 w-4" /> Put one back
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button variant="quiet" size="sm" className="mt-2" onClick={clearUsedFreezer}>
                      Clear finished
                    </Button>
                  </details>
                )}
              </>
            )}
          </>
        )}

        {/* RECIPES */}
        {activeTab === 'vault' && (
          <>
            {showAddRecipe && (
              <Card as="div" className="fade-up space-y-4 p-4">
                <div ref={addFormRef} className="scroll-mt-[68px]">
                  <p className="text-[15px] font-semibold">Add a recipe</p>
                  <p className="mb-3 text-[13px] text-ink-2">Bring in one you already have, or type it below. You’ll check it before it’s saved.</p>
                  <ImportRecipe onDraft={applyDraft} />
                </div>
                {analysisSuccess && (
                  <p role="status" className="rounded-xl bg-sage-soft px-3 py-2 text-[13px] text-sage">
                    {analysisSuccess}
                  </p>
                )}
                <p className="border-t border-line pt-4 text-[13px] font-semibold text-ink-2">Check it over, or type it in yourself</p>
                {(
                  <form onSubmit={handleSaveManualRecipe} className="space-y-2">
                    <TextInput value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Dish name" aria-label="Dish name" required />
                    <TextInput value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="One line about it (optional)" aria-label="Description" />
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={customCuisine} onChange={(e) => setCustomCuisine(e.target.value)} aria-label="Cuisine">
                        {Array.from(new Set(['British', 'Italian', 'Indian', 'Mexican', 'Chinese', 'Thai', 'Greek', 'French', 'Japanese', customCuisine, 'Other'])).map((c) => (
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
                    <textarea
                      value={customIngredients}
                      onChange={(e) => setCustomIngredients(e.target.value)}
                      rows={4}
                      placeholder={'Ingredients, one per line'}
                      aria-label="Ingredients"
                      className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
                    />
                    <textarea
                      value={customSteps}
                      onChange={(e) => setCustomSteps(e.target.value)}
                      rows={5}
                      placeholder={'Steps, one per line. Add timing like (-15m)'}
                      aria-label="Steps"
                      className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
                    />
                    <Button type="submit" variant="primary" block disabled={!customTitle.trim()}>
                      Save recipe
                    </Button>
                  </form>
                )}
              </Card>
            )}

            <Segmented<'ours' | 'world'>
              label="Recipe collection"
              value={recipeScope}
              onChange={setRecipeScope}
              options={[
                { value: 'ours', label: `Our recipes · ${meals.length}` },
                { value: 'world', label: `World kitchen · ${worldAvailable.length}` },
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
                      'h-10 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                      vaultFilter === id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:border-line-strong'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none" role="radiogroup" aria-label="Cuisine">
                  {[{ id: 'all', label: 'All', symbol: '🌍' }, ...POPULAR_CUISINES, { id: 'other', label: 'Other', symbol: '🍽️' }].map((c) => (
                    <button
                      key={c.id}
                      role="radio"
                      aria-checked={worldCuisine === c.id}
                      onClick={() => setWorldCuisine(c.id)}
                      className={cx(
                        'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                        worldCuisine === c.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:border-line-strong'
                      )}
                    >
                      <CuisineFlag code={(c as { code?: string }).code} symbol={(c as { symbol?: string }).symbol} />
                      {c.label}
                    </button>
                  ))}
                </div>
                {worldCuisine !== 'all' && (
                  <button
                    onClick={() => setWorldCuisine('all')}
                    className="inline-flex min-h-11 items-center gap-1 px-1 text-[14px] font-semibold text-ink-2 hover:text-ink"
                  >
                    <ChevronLeft className="h-4 w-4" /> Back to all cuisines
                  </button>
                )}
              </div>
            )}

            {(recipeScope === 'ours' ? filteredVaultMeals : browsingPicks ? worldPicks : filteredWorld).length === 0 ? (
              <p className="py-8 text-center text-[14px] text-ink-2">Nothing matches. Try another search.</p>
            ) : (
              <ul className="space-y-2">
                {(recipeScope === 'ours' ? filteredVaultMeals : browsingPicks ? worldPicks : filteredWorld).map((meal) => {
                  const match = getMealPantryMatch(meal);
                  const added = recipeScope === 'world' && meals.some((m) => m.id === meal.id);
                  return (
                    <li key={meal.id}>
                      <div className="flex items-stretch gap-2">
                      <button
                        onClick={() => setSheetMeal(meal)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-card p-2.5 text-left transition-colors hover:border-line-strong"
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
                      {!added && (
                        <button
                          aria-label={`Remove ${meal.title}`}
                          aria-expanded={confirmRemove === meal.id}
                          onClick={() => setConfirmRemove(confirmRemove === meal.id ? null : meal.id)}
                          className="flex w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-card text-ink-3 transition-colors hover:border-line-strong hover:text-tomato"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      </div>
                      {confirmRemove === meal.id && (
                        <div className="fade-up mt-1.5 rounded-xl bg-tomato-soft p-3 text-[14px] text-tomato">
                          <p>
                            {recipeScope === 'ours'
                              ? `Remove “${meal.title}” from our recipes? We’ll swap in a similar dish from the World Kitchen.`
                              : `Take “${meal.title}” out of the World Kitchen? Another dish will take its place.`}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(null)}>
                              Keep it
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setConfirmRemove(null);
                                if (recipeScope === 'ours') {
                                  const replacement = rejectMeal(meal.id);
                                  flash(
                                    replacement
                                      ? `“${meal.title}” removed. “${replacement.title}” has taken its place.`
                                      : `“${meal.title}” removed.`
                                  );
                                } else {
                                  hideLibraryRecipe(meal.id);
                                  flash(`“${meal.title}” taken out of the World Kitchen.`);
                                }
                              }}
                            >
                              {recipeScope === 'ours' ? 'Remove and replace' : 'Take it out'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {browsingPicks && worldAvailable.length > worldPicks.length && (
              <p className="px-1 text-center text-[12px] text-ink-3">
                Showing {worldPicks.length} of {worldAvailable.length} dishes. Search or choose a cuisine to see them all.
              </p>
            )}

            {recipeScope === 'ours' && (
              <div className="space-y-3 border-t border-line pt-3">
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
                  : 'Only on this phone. Turn on sharing in Household & backup'}
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
                <Button variant="secondary" className="mt-4" onClick={() => setActiveView(5)}>
                  Browse recipes
                </Button>
              </Card>
            ) : (
              <>
                {toBuy.length > 0 && (
                  <div className="flex items-center justify-between gap-3 px-1">
                    <label htmlFor="store-pick" className="text-[13px] text-ink-2">
                      Search items at
                    </label>
                    <Select id="store-pick" value={store} onChange={(e) => setStore(e.target.value as StoreId)} className="!text-[14px]">
                      {STORES.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
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
                                <span
                                  aria-hidden="true"
                                  className={cx(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunk text-[19px] leading-none',
                                    item.checked && 'opacity-40 grayscale'
                                  )}
                                >
                                  {itemIcon(item.name)}
                                </span>
                                <span className="min-w-0">
                                  <span className={cx('block line-clamp-2 text-[15px] leading-snug', item.checked && 'text-ink-3 line-through')}>
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
                              {!item.checked && (
                                <a
                                  href={storeInfo.url(item.name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Find ${item.name} at ${storeInfo.label} (opens a new tab)`}
                                  className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-3 hover:bg-sunk hover:text-ink"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
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
                <Button variant="primary" block onClick={() => setDeliveryOpen(true)} disabled={toBuy.length === 0}>
                  <Bike className="h-4 w-4" /> Get it delivered
                </Button>
                <p className="text-center text-[12px] text-ink-3">
                  “Put away” moves ticked items into the fridge and clears them from the list.
                </p>
                <DeliverySheet isOpen={deliveryOpen} onClose={() => setDeliveryOpen(false)} items={toBuy.map((i) => i.name)} />
              </>
            )}
          </>
        )}

        {/* SCAN */}
        {activeTab === 'camera' && renderScan()}

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
            <p className="text-[15px] font-semibold">Diets</p>
            <DietPicker value={diets} onToggle={toggleDiet} />
            <MemberPrefs />
            <p className="pt-2 text-[15px] font-semibold">Never</p>
            <p className="text-[14px] text-ink-2">
              Dishes with these leave your recipes and are replaced by ones you might like. Take an ingredient off and its
              dishes come back.
            </p>
            {bannedIngredients.length === 0 ? (
              <p className="text-[14px] text-ink-3">Nothing on the list.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {bannedIngredients.map((ing) => (
                  <li key={ing} className="inline-flex items-center gap-1 rounded-full bg-tomato-soft py-1 pr-1 pl-3 text-[13px] text-tomato">
                    {ing}
                    <button
                      onClick={() => {
                        const note = toggleBannedIngredient(ing);
                        if (note) flash(note);
                      }}
                      aria-label={`Allow ${ing} again`}
                      className="rounded-full p-1 opacity-70 hover:opacity-100"
                    >
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
                const note = toggleBannedIngredient(newBannedName.trim());
                if (note) flash(note);
                setNewBannedName('');
              }}
            >
              <TextInput value={newBannedName} onChange={(e) => setNewBannedName(e.target.value)} placeholder="e.g. Olives" aria-label="Ingredient to avoid" />
              <Button type="submit" variant="secondary" disabled={!newBannedName.trim()}>
                Avoid
              </Button>
            </form>
            {shelvedMeals.length > 0 && (
              <p className="text-[13px] text-ink-3">
                {shelvedMeals.length} {shelvedMeals.length === 1 ? 'dish is' : 'dishes are'} set aside because of this list.
              </p>
            )}

            <p className="pt-3 text-[15px] font-semibold">Love</p>
            <p className="text-[14px] text-ink-2">
              Add what you enjoy and we’ll bring in more dishes built on it, and favour it when replacing anything.
            </p>
            {likedIngredients.length === 0 ? (
              <p className="text-[14px] text-ink-3">Nothing here yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {likedIngredients.map((ing) => (
                  <li key={ing} className="inline-flex items-center gap-1 rounded-full bg-sage-soft py-1 pr-1 pl-3 text-[13px] text-sage">
                    {ing}
                    <button onClick={() => removeLikedIngredient(ing)} aria-label={`Stop favouring ${ing}`} className="rounded-full p-1 opacity-70 hover:opacity-100">
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
                if (!newLovedName.trim()) return;
                const note = addLikedIngredient(newLovedName.trim());
                if (note) flash(note);
                setNewLovedName('');
              }}
            >
              <TextInput value={newLovedName} onChange={(e) => setNewLovedName(e.target.value)} placeholder="e.g. Chilli" aria-label="Ingredient you love" />
              <Button type="submit" variant="secondary" disabled={!newLovedName.trim()}>
                Love
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
