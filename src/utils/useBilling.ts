import { useCallback, useEffect, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import {
  FREE_MONTHLY_AI_SCANS,
  PRO_PLANS,
  type BillingEntitlement,
  type BillingInterval,
  type PlanOffer,
} from './billing';

const DEFAULT_ENTITLEMENT: BillingEntitlement = {
  isPro: true,
  isOwner: false,
  billingConfigured: false,
  plan: 'free',
  status: 'free',
  hasPortal: false,
  aiScansUsed: 0,
  aiScansLimit: FREE_MONTHLY_AI_SCANS,
  canUseAiScan: true,
  canUseAiChef: true,
  canUseWeekPlanner: true,
  canUseFamilySync: true,
};

export function useBilling() {
  const { householdCode, authHeaders } = useDinner();
  const [entitlement, setEntitlement] = useState<BillingEntitlement>(DEFAULT_ENTITLEMENT);
  const [plans, setPlans] = useState<PlanOffer[]>(PRO_PLANS);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setLoading(true);
    try {
      const headers = householdCode ? authHeaders() : {};
      const res = await fetch('/api/billing/status', { headers });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.entitlement) setEntitlement(json.entitlement);
      if (Array.isArray(json?.plans)) setPlans(json.plans);
    } catch {
      // Offline: keep last known entitlement
    } finally {
      setLoading(false);
    }
  }, [householdCode, authHeaders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startCheckout = useCallback(
    async (interval: BillingInterval): Promise<boolean> => {
      setError(null);
      if (!householdCode) {
        setError('Start or join a family group first so one plan covers every phone in your household.');
        return false;
      }
      setBusyAction(interval);
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ interval }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json?.error || 'Could not start checkout just now.');
          return false;
        }
        if (json?.alreadyFreeForOwner) {
          await refresh();
          return true;
        }
        if (json?.url && typeof window !== 'undefined') {
          window.location.assign(json.url);
          return true;
        }
        setError('Checkout link was missing. Try again in a moment.');
        return false;
      } catch {
        setError('Network error starting checkout. Try again.');
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [householdCode, authHeaders, refresh]
  );

  const openPortal = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!householdCode) return false;
    setBusyAction('portal');
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        setError(json?.error || 'Could not open billing portal just now.');
        return false;
      }
      if (typeof window !== 'undefined') window.location.assign(json.url);
      return true;
    } catch {
      setError('Network error opening billing portal.');
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [householdCode, authHeaders]);

  return {
    entitlement,
    plans,
    loading,
    busyAction,
    error,
    setError,
    refresh,
    startCheckout,
    openPortal,
  };
}
